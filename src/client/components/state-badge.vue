<script setup lang="ts">
/**
 * A small label saying where a title's file lives right now, or what the worker is doing to it, with a colour and icon
 * for each. Hovering shows what the label means and the path Tetharr checked.
 */

import {
  PhArrowClockwise,
  PhCircleHalf,
  PhClock,
  PhCloud,
  PhCopySimple,
  PhFileDashed,
  PhFileX,
  PhHardDrive,
  PhLinkBreak,
  PhLinkSimple,
} from "@phosphor-icons/vue";
import { computed } from "vue";

type Badge =
  | "streamed"
  | "local"
  | "partial"
  | "unmanaged"
  | "broken"
  | "unseen"
  | "none"
  | "queued"
  | "copying"
  | "restoring"
  | "regrabbing";

const props = defineProps<{ state: Badge; detail?: string | undefined; path?: string | undefined }>();

// What each label says, its colour and icon, and what it means
const STATES = {
  streamed: { label: "Streamed", tone: "badge-info", icon: PhCloud, hint: "A link into the mount" },
  local: { label: "Local", tone: "badge-success", icon: PhHardDrive, hint: "A local copy Tetharr made" },
  partial: {
    label: "Partly local",
    tone: "badge-success",
    icon: PhCircleHalf,
    hint: "Some files are local copies, and the rest are streamed",
  },
  unmanaged: {
    label: "Local · unmanaged",
    tone: "badge-success",
    icon: PhHardDrive,
    hint: "A local file Tetharr didn't create, so it's never changed or deleted",
  },
  broken: {
    label: "Unreachable",
    tone: "badge-error",
    icon: PhLinkBreak,
    hint: "The link can't be followed. Is the mount down?",
  },
  unseen: {
    label: "Missing",
    tone: "badge-warning",
    icon: PhFileX,
    hint: "Tetharr can't see this file. Check the path mappings",
  },
  none: { label: "No file", tone: "", icon: PhFileDashed, hint: "The Arr has no file for this yet" },
  queued: { label: "Queued", tone: "badge-primary", icon: PhClock, hint: "Waiting for the worker" },
  copying: { label: "Copying", tone: "badge-primary", icon: PhCopySimple, hint: "Making a local copy" },
  restoring: { label: "Restoring", tone: "badge-primary", icon: PhLinkSimple, hint: "Putting the link back" },
  regrabbing: {
    label: "Re-grabbing",
    tone: "badge-primary",
    icon: PhArrowClockwise,
    hint: "Deleting the copy so the Arr downloads it again",
  },
};

const info = computed(() => STATES[props.state]);
</script>

<template>
  <span class="badge gap-1 badge-soft badge-sm" :class="info.tone" :title="path ? `${info.hint}\n${path}` : info.hint">
    <component :is="info.icon" weight="bold" class="size-3.5" />
    {{ info.label }}
    <span v-if="detail" class="font-mono">{{ detail }}</span>
  </span>
</template>
