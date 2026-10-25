<script setup>
defineProps({name:String});
</script>
<template>
 <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">
  <g v-if="name==='/'" fill="currentColor" stroke="none"><ellipse cx="7" cy="7" rx="2" ry="2.6" transform="rotate(-20 7 7)"/><ellipse cx="17" cy="7" rx="2" ry="2.6" transform="rotate(20 17 7)"/><ellipse cx="3.8" cy="12" rx="1.5" ry="2"/><ellipse cx="20.2" cy="12" rx="1.5" ry="2"/><path d="M12 11.5c-2 0-2.8 2.4-4.2 3.6-1 .9-1.6 1.8-1.3 3 .4 1.8 2.2 2.5 3.8 1.8a5 5 0 0 1 3.4 0c1.6.7 3.4 0 3.8-1.8.3-1.2-.3-2.1-1.3-3-1.4-1.2-2.2-3.6-4.2-3.6Z"/></g>
  <g v-else-if="name==='/chat'"><path d="M20 11a8 8 0 0 1-8 8H8l-5 3 1.5-6A8 8 0 1 1 20 11Z"/><path d="M8 10h8M8 14h5"/></g>
  <g v-else-if="name==='/today'"><circle cx="12" cy="12" r="9"/><path d="m7.5 12 3 3 6-6"/></g>
  <g v-else-if="name==='/workouts'"><path d="M7 12h10M4 8v8m3-10v12m10-12v12m3-10v8M2 10v4m20-4v4"/></g>
  <g v-else-if="name==='/meals'"><path d="M3 11h18a9 9 0 0 1-18 0Zm4 10h10M8 7V3m4 4V2m4 5V3"/></g>
  <g v-else-if="name==='/cook'"><path d="M5 11h14v7a3 3 0 0 1-3 3H8a3 3 0 0 1-3-3Zm-2 3h2m14 0h2M4 8h16M9 8V6h6v2M9 3V2m6 1V2"/></g>
  <g v-else><circle cx="12" cy="8" r="3.3"/><path d="M5 21v-2a7 7 0 0 1 14 0v2"/></g>
 </svg>
</template>
<style scoped>svg{width:24px;height:24px;display:block;flex:none}</style>
