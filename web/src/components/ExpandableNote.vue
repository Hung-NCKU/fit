<script setup>
defineProps({preview:{type:String,required:true},label:{type:String,default:'完整說明'}});
</script>
<template>
 <details class="expandable-note small muted">
  <summary :aria-label="label"><span class="note-preview">{{ preview }}</span><span class="note-heading">{{ label }}</span><span class="expand-label">展開</span><span class="collapse-label">收起</span></summary>
  <div class="note-body"><slot /></div>
 </details>
</template>
<style scoped>
.expandable-note{min-width:0;margin:0;line-height:1.7}.expandable-note summary{display:flex;align-items:baseline;gap:.6rem;cursor:pointer;list-style:none;min-height:32px}.expandable-note summary::-webkit-details-marker{display:none}.note-preview{min-width:0;flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.expand-label,.collapse-label{flex-shrink:0;color:var(--accent);text-decoration:underline;text-underline-offset:3px}.note-heading,.collapse-label{display:none}.expandable-note[open] .note-preview,.expandable-note[open] .expand-label{display:none}.expandable-note[open] .note-heading,.expandable-note[open] .collapse-label{display:block}.note-heading{flex:1;color:var(--text)}.note-body{margin-top:.35rem}.note-body :deep(p){margin:0;line-height:1.8}.expandable-note summary:focus-visible{outline:2px solid var(--accent);outline-offset:3px;border-radius:4px}
</style>
