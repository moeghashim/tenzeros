<script setup lang="ts">
import { IconBolt, IconUsers, IconTarget, IconSparkles, IconMail } from '@tabler/icons-vue'
defineProps<{ flowKey: string }>()
</script>
<template>
  <div class="preview" aria-hidden="true">
    <div v-if="flowKey === 'start-outreach'" class="sequence">
      <span><IconMail :size="20" /></span><i /><small>2 days</small><i /><span
        ><OnboardingBrandIcon name="LinkedIn"
      /></span>
    </div>
    <div v-else class="window">
      <div class="toolbar">
        <component
          :is="
            flowKey === 'activate-agents'
              ? IconBolt
              : flowKey === 'existing-customers'
                ? IconUsers
                : flowKey === 'target-account-list'
                  ? IconTarget
                  : IconSparkles
          "
          :size="12"
        /><i /><span>+</span>
      </div>
      <div v-if="flowKey === 'pipeline-and-lists'" class="kanban">
        <div v-for="n in 3" :key="n"><i /><span /><span v-if="n === 2" /></div>
      </div>
      <template v-else
        ><div v-for="n in 3" :key="n" class="row">
          <i /><span
            v-if="flowKey === 'activate-agents'"
            class="toggle"
            :class="{ off: n === 3 }"
          /><small v-else-if="flowKey === 'target-account-list'" :class="`fit-${n}`">{{
            ['Strong fit', 'Partial fit', 'Poor fit'][n - 1]
          }}</small
          ><b v-else /></div
      ></template>
    </div>
  </div>
</template>
<style scoped>
.preview {
  height: 130px;
  background: linear-gradient(#fafafa, #f6f6f6);
  display: grid;
  place-items: center;
  border-bottom: 1px solid #f0f0f0;
  padding: 20px 18px;
  overflow: hidden;
}
.window {
  width: 100%;
  background: white;
  border: 1px solid #e8e8e8;
  border-radius: 8px;
  padding: 8px 10px;
  box-shadow: 0 4px 10px #00000004;
  transform: translateY(8px);
}
.toolbar {
  display: flex;
  align-items: center;
  gap: 6px;
  padding-bottom: 8px;
  color: #999;
}
.toolbar i {
  width: 55px;
  height: 5px;
  background: #eee;
  border-radius: 4px;
}
.toolbar span {
  margin-left: auto;
}
.kanban {
  display: flex;
  gap: 7px;
}
.kanban div {
  flex: 1;
  background: #fafafa;
  padding: 5px;
}
.kanban i,
.kanban span {
  display: block;
  height: 6px;
  background: #e9e9e9;
  border-radius: 3px;
  margin-bottom: 6px;
}
.kanban span {
  height: 20px;
  background: white;
  border: 1px solid #eee;
}
.row {
  display: flex;
  gap: 10px;
  align-items: center;
  height: 20px;
}
.row i {
  width: 62%;
  height: 5px;
  background: #eee;
  border-radius: 4px;
}
.row b {
  background: #f2f2f2;
  border-radius: 4px;
  width: 25%;
  height: 6px;
}
.toggle {
  width: 19px;
  height: 10px;
  border-radius: 10px;
  background: #aaa;
  margin-left: auto;
}
.toggle:after {
  content: '';
  display: block;
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: white;
  margin: 2px 2px 2px auto;
}
.toggle.off {
  background: #ddd;
}
.toggle.off:after {
  margin-left: 2px;
}
small {
  white-space: nowrap;
  font-size: 7px;
  border-radius: 3px;
  padding: 1px 3px;
  background: #eee;
}
.fit-1 {
  color: #218358;
  background: #e6f6eb;
}
.fit-2 {
  color: #ab6400;
  background: #fff7c2;
}
.sequence {
  display: flex;
  align-items: center;
}
.sequence span {
  width: 34px;
  height: 34px;
  background: white;
  border: 1px solid #e4e4e4;
  border-radius: 8px;
  display: grid;
  place-items: center;
  color: #999;
}
.sequence :deep(svg) {
  width: 17px;
}
.sequence i {
  width: 16px;
  height: 1px;
  background: #ddd;
}
</style>
