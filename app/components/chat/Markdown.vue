<script setup lang="ts">
import { safeMarkdown } from '../../utils/markdown'
const props = defineProps<{ content: string }>()
const html = computed(() => safeMarkdown(props.content))
</script>
<template><div class="markdown" v-html="html" /></template>
<style scoped>
.markdown {
  overflow-wrap: anywhere;
  line-height: 1.65;
}
.markdown :deep(p) {
  margin: 0 0 10px;
}
.markdown :deep(ul),
.markdown :deep(ol) {
  padding-left: 22px;
}
.markdown :deep(h3) {
  font-size: 15px;
  margin: 12px 0;
}
.markdown :deep(pre) {
  white-space: pre-wrap;
  background: #f5f5f5;
  padding: 10px;
  border-radius: 8px;
}
.markdown :deep(table) {
  display: block;
  overflow-x: auto;
  border-collapse: collapse;
}
.markdown :deep(td),
.markdown :deep(th) {
  border: 1px solid #ddd;
  padding: 6px;
}
</style>
