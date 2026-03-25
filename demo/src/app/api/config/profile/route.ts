import { NextRequest } from "next/server";
import { loadStructuredProfile, saveProfileSections } from "@/lib/profile-context";

export async function GET() {
  try {
    const profile = loadStructuredProfile();
    return new Response(JSON.stringify(profile), {
      headers: { "Content-Type": "application/json" },
    });
  } catch {
    return new Response(JSON.stringify({ sections: [], generatedContent: "", content: "" }), {
      headers: { "Content-Type": "application/json" },
    });
  }
}

export async function PUT(req: NextRequest) {
  try {
    const body = await req.json();

    if (typeof body?.content === "string") {
      const profile = saveProfileSections([{ id: "story", content: body.content }]);
      return new Response(JSON.stringify(profile), {
        headers: { "Content-Type": "application/json" },
      });
    }

    const sections = body?.sections;
    const profileConfig = body?.profileConfig;
    if (!Array.isArray(sections) || sections.some((section) =>
      !section
      || typeof section !== "object"
      || typeof section.id !== "string"
      || typeof section.content !== "string"
    )) {
      return new Response(
        JSON.stringify({ error: "sections must be an array of { id, content }" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    const profile = saveProfileSections(
      sections,
      profileConfig && typeof profileConfig === "object"
        ? {
            displayName: typeof profileConfig.displayName === "string" ? profileConfig.displayName : undefined,
            profileFile: typeof profileConfig.profileFile === "string" ? profileConfig.profileFile : undefined,
            profileBasics: profileConfig.profileBasics && typeof profileConfig.profileBasics === "object"
              ? {
                  age: typeof profileConfig.profileBasics.age === "string" ? profileConfig.profileBasics.age : "",
                  gender: typeof profileConfig.profileBasics.gender === "string" ? profileConfig.profileBasics.gender : "",
                  location: typeof profileConfig.profileBasics.location === "string" ? profileConfig.profileBasics.location : "",
                  occupation: typeof profileConfig.profileBasics.occupation === "string" ? profileConfig.profileBasics.occupation : "",
                }
              : undefined,
          }
        : undefined
    );
    return new Response(JSON.stringify(profile), {
      headers: { "Content-Type": "application/json" },
    });
  } catch {
    return new Response(
      JSON.stringify({ error: "Failed to save profile" }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
}
