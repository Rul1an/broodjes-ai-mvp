<template>
  <div v-if="show" class="modal-vue">
    <div class="modal-content-vue">
      <span class="close-vue" @click="closeModal">&times;</span>
      <h3>{{ title }}</h3>
      <img :src="imageUrl" alt="Gegenereerde visualisatie" />
    </div>
  </div>
</template>

<script setup>
import { defineProps, defineEmits } from 'vue';

const props = defineProps({
  show: Boolean,
  imageUrl: String,
  title: String
});

const emit = defineEmits(['close']);

function closeModal() {
  emit('close');
}
</script>

<style scoped>
.modal-vue {
  display: block; /* Changed from none to block for v-if to control visibility */
  position: fixed;
  z-index: 1001; /* Higher than other elements */
  left: 0;
  top: 0;
  width: 100%;
  height: 100%;
  overflow: auto;
  background-color: rgba(0, 0, 0, 0.6);
}

.modal-content-vue {
  background-color: #fefefe;
  margin: 10% auto;
  padding: 20px;
  border: 1px solid #888;
  width: 80%;
  max-width: 600px;
  text-align: center;
  border-radius: 8px;
  position: relative;
}

.close-vue {
  color: #aaa;
  position: absolute;
  top: 10px;
  right: 20px;
  font-size: 28px;
  font-weight: bold;
}

.close-vue:hover,
.close-vue:focus {
  color: black;
  text-decoration: none;
  cursor: pointer;
}

.modal-content-vue img {
  max-width: 100%;
  max-height: 70vh;
  margin-top: 15px;
  border-radius: 4px;
}
</style>
