<script setup lang="ts">
import type { NuxtError } from '#app'
defineProps<{ error: NuxtError }>()
</script>
<template>
  <main class="page">
    <h1>{{ error.statusCode === 404 ? 'Workspace or page not found' : 'Something went wrong' }}</h1>
    <p v-if="error.statusCode === 404">
      Check the address or sign in to a workspace you belong to.
    </p>
    <p v-else>{{ error.statusMessage || 'Please try again.' }}</p>
    <button class="primary" @click="clearError({ redirect: '/login' })">Back to sign in</button>
  </main>
</template>
<style scoped>
button {
  margin-top: 24px;
}
</style>
