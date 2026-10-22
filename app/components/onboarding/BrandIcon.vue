<script setup lang="ts">
import {
  siGmail,
  siGooglecalendar,
  siHubspot,
  siGooglesheets,
  siLinkedin,
  siNotion,
  type SimpleIcon,
} from 'simple-icons'
const props = defineProps<{ name: string }>()
const icons: Record<string, SimpleIcon> = {
  Gmail: siGmail,
  Calendar: siGooglecalendar,
  HubSpot: siHubspot,
  CSV: siGooglesheets,
  LinkedIn: siLinkedin,
  Notion: siNotion,
}
const icon = computed(() => icons[props.name])
</script>
<template>
  <svg v-if="icon" viewBox="0 0 24 24" aria-hidden="true" :style="{ color: `#${icon.hex}` }">
    <path :d="icon.path" fill="currentColor" />
  </svg>
  <span v-else class="monogram" :class="name.toLowerCase()" aria-hidden="true">{{
    name === 'Tenzeros' ? '10' : name === 'Affinity' ? '✳' : name.charAt(0)
  }}</span>
</template>
<style scoped>
svg {
  width: 26px;
  height: 26px;
}
.monogram {
  font-size: 26px;
  font-weight: 600;
  line-height: 1;
  letter-spacing: -2px;
}
.affinity {
  color: #4656ef;
}
.pipedrive {
  color: #138a41;
}
</style>
