<script setup>
import { nextTick, ref, watch } from 'vue';
import { confirmation, finishConfirmation } from '../confirm.js';
const cancelButton = ref(null);
let previousFocus;
watch(() => confirmation.open, async open => {
  if (open) {
    previousFocus = document.activeElement;
    await nextTick();
    cancelButton.value?.focus();
  } else previousFocus?.focus?.();
});
function handleKeys(event) {
  if (event.key === 'Escape') finishConfirmation(false);
  if (event.key === 'Tab') {
    const buttons = [...event.currentTarget.querySelectorAll('button')];
    const index = buttons.indexOf(document.activeElement);
    event.preventDefault();
    buttons[(index + (event.shiftKey ? -1 : 1) + buttons.length) % buttons.length]?.focus();
  }
}
</script>

<template>
  <Teleport to="body">
    <div v-if="confirmation.open" class="confirm-overlay" @click.self="finishConfirmation(false)">
      <section class="card confirm-panel" role="alertdialog" aria-modal="true" aria-labelledby="confirm-title" aria-describedby="confirm-message" @keydown="handleKeys">
        <h3 id="confirm-title">{{ confirmation.title }}</h3>
        <p id="confirm-message">{{ confirmation.message }}</p>
        <div class="row">
          <button ref="cancelButton" @click="finishConfirmation(false)">取消</button>
          <button class="primary" @click="finishConfirmation(true)">確認</button>
        </div>
      </section>
    </div>
  </Teleport>
</template>

<style scoped>
.confirm-overlay { position: fixed; inset: 0; z-index: 200; background: #000a; display: grid; place-items: center; padding: 1rem; }
.confirm-panel { width: 100%; max-width: 380px; }
p { white-space: pre-line; }
.row { justify-content: flex-end; gap: .6rem; }
</style>
