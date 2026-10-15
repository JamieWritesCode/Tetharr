/**
 * Starts the web interface: loads the styles, connects the page router and the cache of server data, and puts the app
 * on the page.
 */

import { VueQueryPlugin } from "@tanstack/vue-query";
import { createApp } from "vue";
import App from "./app.vue";
import { router } from "./router.ts";
import * as QueryService from "./services/query.ts";
import "./style.css";

createApp(App).use(router).use(VueQueryPlugin, { queryClient: QueryService.cache }).mount("#app");
