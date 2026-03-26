import DefaultTheme from "vitepress/theme";
import type { Theme } from "vitepress";
import { onMounted, watch, nextTick } from "vue";
import { useRoute } from "vitepress";

import "./custom.css";

declare const __SITE_URL__: string;

function patchLogoLink() {
  const link = document.querySelector<HTMLAnchorElement>(".VPNavBarTitle a");
  if (link) link.href = __SITE_URL__;
}

export default {
  extends: DefaultTheme,
  setup() {
    const route = useRoute();
    onMounted(patchLogoLink);
    watch(() => route.path, () => nextTick(patchLogoLink));
  },
} satisfies Theme;
