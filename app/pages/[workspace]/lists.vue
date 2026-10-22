<script setup lang="ts">
const route = useRoute()
const { data } = await useApiFetch(
  () => `/api/workspaces/${String(route.params.workspace)}/records`,
)
useHead({ title: 'Records & Lists — Tenzeros' })
</script>
<template>
  <section class="page">
    <h1>Records & Lists</h1>
    <p class="muted">Your workspace's companies and contacts.</p>
    <h2>Companies</h2>
    <p v-if="!data?.companies.length" class="muted">Import data to see your companies here.</p>
    <ul>
      <li v-for="company in data?.companies" :key="company.id">
        <strong>{{ company.name }}</strong
        ><span>{{ company.industry }}</span
        ><small v-if="company.isExample">Example</small>
      </li>
    </ul>
    <h2>Contacts</h2>
    <ul>
      <li v-for="contact in data?.contacts" :key="contact.id">
        <strong>{{ contact.name }}</strong
        ><span>{{ contact.email }}</span
        ><small v-if="contact.isExample">Example</small>
      </li>
    </ul>
  </section>
</template>
<style scoped>
ul {
  padding: 0;
  list-style: none;
}
li {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 20px;
  padding: 12px;
  border-bottom: 1px solid #eee;
  background: white;
}
li span {
  color: var(--color-textSecondary);
}
small {
  background: #f0f0f0;
  border-radius: 99px;
  padding: 2px 7px;
  margin-left: auto;
}
</style>
