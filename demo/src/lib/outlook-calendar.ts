import { execFile } from "child_process";
import { ALL_CALENDARS_ID } from "./calendar-constants";
import type { CalendarSource, CalendarIntegrationStatus, CalendarEvent } from "./calendar-types";

function execPowerShell(script: string): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", script], {
      timeout: 20000,
      maxBuffer: 10 * 1024 * 1024,
    }, (err, stdout, stderr) => {
      if (err) {
        reject(new Error(stderr?.trim() || err.message));
        return;
      }
      resolve(stdout.trim());
    });
  });
}

function isOutlookNotInstalled(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  const normalized = message.toLowerCase();
  return normalized.includes("retrieving the com class factory")
    || normalized.includes("80040154")
    || normalized.includes("not registered")
    || normalized.includes("cannot create")
    || normalized.includes("is not recognized");
}

async function listOutlookCalendars(): Promise<CalendarSource[]> {
  const script = `
$ErrorActionPreference = "Stop"
$ol = New-Object -ComObject Outlook.Application
$ns = $ol.GetNamespace("MAPI")
$result = @()
foreach ($store in $ns.Stores) {
  try {
    $cal = $store.GetDefaultFolder(9)
    $result += @{
      id = $store.StoreID
      title = $store.DisplayName
      writable = $true
    }
  } catch {}
}
$result | ConvertTo-Json -Compress -AsArray
`;
  const raw = await execPowerShell(script);
  if (!raw || raw === "null") return [];
  return JSON.parse(raw) as CalendarSource[];
}

export async function getCalendarIntegrationStatus(selectedCalendarId?: string): Promise<CalendarIntegrationStatus> {
  try {
    const calendars = await listOutlookCalendars();
    const selectedCalendarValid = !selectedCalendarId
      || selectedCalendarId === ALL_CALENDARS_ID
      || calendars.some((c) => c.id === selectedCalendarId);

    return {
      installed: true,
      available: calendars.length > 0,
      needsPermission: false,
      backend: "outlook",
      calendars,
      selectedCalendarValid,
      message: calendars.length === 0
        ? "Open Outlook and make sure at least one calendar account is configured."
        : !selectedCalendarValid
          ? "Choose one of the calendars detected in Outlook."
          : "Outlook Calendar is connected on this PC.",
    };
  } catch (error) {
    if (isOutlookNotInstalled(error)) {
      return {
        installed: false,
        available: false,
        needsPermission: false,
        backend: "outlook",
        calendars: [],
        selectedCalendarValid: false,
        message: "Microsoft Outlook is not installed on this PC.",
      };
    }

    return {
      installed: true,
      available: false,
      needsPermission: false,
      backend: "outlook",
      calendars: [],
      selectedCalendarValid: false,
      message: error instanceof Error ? error.message : "Could not read Outlook Calendar.",
    };
  }
}

export async function listRecentCalendarEvents(options?: {
  selectedCalendarId?: string;
  pastDays?: number;
  futureDays?: number;
  limit?: number;
}): Promise<CalendarEvent[]> {
  const selectedCalendarId = options?.selectedCalendarId || ALL_CALENDARS_ID;
  const pastDays = options?.pastDays ?? 3;
  const futureDays = options?.futureDays ?? 1;
  const limit = options?.limit ?? 50;

  // Build date strings in PowerShell-friendly format
  const script = `
$ErrorActionPreference = "Stop"
$ol = New-Object -ComObject Outlook.Application
$ns = $ol.GetNamespace("MAPI")
$startDate = (Get-Date).AddDays(-${pastDays}).ToString("MM/dd/yyyy HH:mm")
$endDate = (Get-Date).AddDays(${futureDays}).ToString("MM/dd/yyyy HH:mm")
$selectedId = "${selectedCalendarId.replace(/"/g, '`"')}"
$limit = ${limit}
$events = @()

foreach ($store in $ns.Stores) {
  $storeId = $store.StoreID
  $storeName = $store.DisplayName
  if ($selectedId -ne "__all__" -and $selectedId -ne "" -and $storeId -ne $selectedId) { continue }

  try {
    $cal = $store.GetDefaultFolder(9)
    $items = $cal.Items
    $items.Sort("[Start]")
    $items.IncludeRecurrences = $true
    $filter = "[Start] >= '$startDate' AND [End] <= '$endDate'"
    $restricted = $items.Restrict($filter)

    foreach ($item in $restricted) {
      if ($events.Count -ge $limit) { break }
      $events += @{
        uid = if ($item.EntryID) { $item.EntryID } else { "" }
        calendarId = $storeId
        calendarTitle = $storeName
        summary = if ($item.Subject) { $item.Subject } else { "" }
        location = if ($item.Location) { $item.Location } else { "" }
        description = ""
        start = $item.Start.ToString("o")
        end = $item.End.ToString("o")
        allDay = [bool]$item.AllDayEvent
      }
    }
  } catch {}
}

$sorted = $events | Sort-Object { [datetime]$_.start }
if ($limit -gt 0) { $sorted = $sorted | Select-Object -First $limit }
$sorted | ConvertTo-Json -Compress -AsArray
`;

  try {
    const raw = await execPowerShell(script);
    if (!raw || raw === "null") return [];
    return JSON.parse(raw) as CalendarEvent[];
  } catch (error) {
    console.error("[calendar] Failed to read Outlook Calendar:", error);
    return [];
  }
}
