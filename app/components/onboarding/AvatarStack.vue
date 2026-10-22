<script setup lang="ts">
import { IconPlus } from '@tabler/icons-vue'
type Member = {
  id: string
  userId: string | null
  name: string | null
  email: string | null
  userEmail: string | null
  avatarColor: string | null
  status: string
}
const props = defineProps<{ members: Member[]; userId: string }>()
const sorted = computed(() =>
  [...props.members].sort((a, b) => {
    const rank = (member: Member) =>
      member.userId === props.userId ? 0 : member.status === 'active' ? 1 : 2
    return rank(a) - rank(b)
  }),
)
</script>
<template>
  <div class="avatars" aria-label="Workspace teammates">
    <TransitionGroup name="chip">
      <span
        v-for="member in sorted.slice(0, 4)"
        :key="member.id"
        class="avatar"
        :class="{ pending: member.status === 'invited' }"
        :style="{
          background: member.avatarColor || '#e9e9ed',
          color: member.avatarColor ? 'white' : '#777',
        }"
        :title="`${member.name || member.email}${member.status === 'invited' ? ' — Waiting to join' : ''}`"
        >{{ (member.name || member.email || '?').charAt(0).toUpperCase() }}</span
      >
      <span v-if="sorted.length > 4" key="overflow" class="avatar overflow"
        >+{{ sorted.length - 4 }}</span
      >
    </TransitionGroup>
    <span class="add"
      ><svg viewBox="0 0 42 42" aria-hidden="true">
        <circle
          cx="21"
          cy="21"
          r="19.25"
          pathLength="160"
          fill="none"
          stroke="currentColor"
          stroke-width="1.5"
          stroke-dasharray="5 5"
        /></svg
      ><IconPlus :size="16"
    /></span>
  </div>
</template>
<style scoped>
.avatars {
  display: flex;
  align-items: center;
  padding-left: 4px;
}
.avatar {
  width: 50px;
  height: 50px;
  border-radius: 50%;
  border: 2px solid white;
  box-shadow: var(--shadow-sm);
  display: grid;
  place-items: center;
  font-size: 25px;
  margin-left: -5px;
}
.avatar.pending {
  border-style: dashed;
  font-size: 20px;
}
.overflow {
  font-size: 14px;
  background: #eee;
}
.add {
  margin-left: 6px;
  width: 50px;
  height: 50px;
  position: relative;
  display: grid;
  place-items: center;
  color: #929292;
}
.add > svg:first-child {
  position: absolute;
  inset: 0;
  width: 100%;
  color: #ddd;
}
.chip-enter-active,
.chip-leave-active {
  transition:
    transform 0.25s,
    opacity 0.25s;
}
.chip-enter-from,
.chip-leave-to {
  opacity: 0;
  transform: scale(0.5);
}
</style>
