<script setup>
defineProps({name:String});
</script>
<template>
 <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">
  <g v-if="name==='/'" fill="currentColor" stroke="none"><ellipse cx="8.7" cy="4.9" rx="2.25" ry="2.9" transform="rotate(-12 8.7 4.9)"/><ellipse cx="15.3" cy="4.9" rx="2.25" ry="2.9" transform="rotate(12 15.3 4.9)"/><ellipse cx="4.1" cy="10" rx="2" ry="2.65" transform="rotate(-28 4.1 10)"/><ellipse cx="19.9" cy="10" rx="2" ry="2.65" transform="rotate(28 19.9 10)"/><path d="M12 10.5C9 10.5 8.4 13 6.7 14.7C5 16.4 4.8 18.7 6.4 20C8 21.3 10.3 19.8 12 19.8C13.7 19.8 16 21.3 17.6 20C19.2 18.7 19 16.4 17.3 14.7C15.6 13 15 10.5 12 10.5Z"/></g>
  <g v-else-if="name==='/chat'"><path d="M20 11a8 8 0 0 1-8 8H8l-5 3 1.5-6A8 8 0 1 1 20 11Z"/><path d="M8 10h8M8 14h5"/></g>
  <g v-else-if="name==='/today'"><circle cx="12" cy="12" r="9"/><path d="m7.5 12 3 3 6-6"/></g>
  <g v-else-if="name==='/workouts'"><path d="M7 12h10M4 8v8m3-10v12m10-12v12m3-10v8M2 10v4m20-4v4"/></g>
  <g v-else-if="name==='/meals'"><path d="M3 11h18a9 9 0 0 1-18 0Zm4 10h10M8 7V3m4 4V2m4 5V3"/></g>
  <g v-else-if="name==='/cook'"><path d="M5 11h14v7a3 3 0 0 1-3 3H8a3 3 0 0 1-3-3Zm-2 3h2m14 0h2M4 8h16M9 8V6h6v2M9 3V2m6 1V2"/></g>
  <g v-else><circle cx="12" cy="8" r="3.3"/><path d="M5 21v-2a7 7 0 0 1 14 0v2"/></g>
 </svg>
</template>
<style scoped>svg{width:24px;height:24px;display:block;flex:none}</style>
