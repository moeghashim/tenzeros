<template>
  <div
    class="consent-preview"
    role="img"
    aria-label="Illustration of Google permissions with every checkbox selected"
  >
    <div class="account">
      <OnboardingBrandIcon name="Gmail" /><span>Choose what Tenzeros can access</span>
    </div>
    <div><span class="check">✓</span><strong>Select all</strong></div>
    <div><span class="check">✓</span>Read your email messages</div>
    <div><span class="check">✓</span>See your calendars and events</div>
    <small>Permission preview · illustration</small>
  </div>
</template>
<style scoped>
.consent-preview {
  border: 1px solid #e4e7eb;
  border-radius: 14px;
  background: #fafbfc;
  padding: 20px;
  display: grid;
  gap: 14px;
  margin-bottom: 20px;
  font-size: 12px;
}
.consent-preview > div {
  display: flex;
  align-items: center;
  gap: 12px;
}
.account {
  margin-bottom: 6px;
  font-size: 14px;
}
.check {
  display: grid;
  place-items: center;
  width: 16px;
  height: 16px;
  border-radius: 3px;
  background: #1888f2;
  color: white;
}
small {
  color: #999;
}
</style>
