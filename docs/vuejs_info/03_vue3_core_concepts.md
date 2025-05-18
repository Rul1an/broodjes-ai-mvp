# Vue.js 3 Kernconcepten

## Declarative Rendering en Reactivity

Vue stelt je in staat om HTML declaratief te renderen op basis van JavaScript-staat.

**Declarative Rendering:** Vue breidt HTML uit met een template-syntaxis.
```html
<div id="app">
  <p>{{ message }}</p>
  <button @click="count++">Count is: {{ count }}</button>
</div>
```

**Reactivity:** Vue volgt automatisch wijzigingen in JavaScript-staat (bijv. `message` of `count` in het voorbeeld) en werkt de DOM efficiënt bij wanneer deze wijzigingen optreden. `ref()` wordt gebruikt in de Composition API om reactieve variabelen te creëren.

```javascript
// Composition API met <script setup>
import { ref } from 'vue'
const message = ref('Hallo Vue!')
const count = ref(0)
```

## Template Syntaxis

Vue gebruikt een HTML-gebaseerde template-syntaxis.

*   **Tekst Interpolatie**: Dubbele accolades `{{ }}`.
    ```html
    <span>Message: {{ msg }}</span>
    ```

*   **Raw HTML**: `v-html` directive (gebruik voorzichtig vanwege XSS-risico's).
    ```html
    <p><span v-html="rawHtml"></span></p>
    ```

*   **Attribuut Bindingen**: `v-bind` directive, of de shorthand `:`.
    ```html
    <div v-bind:id="dynamicId"></div>
    <img :src="imageSrc" :alt="imageAlt">
    <button :disabled="isButtonDisabled">Button</button>
    ```

*   **JavaScript Expressies**: Binnen accolades en directive-waarden.
    ```html
    {{ number + 1 }}
    {{ ok ? 'YES' : 'NO' }}
    <div :id="`list-${id}`"></div>
    ```

## Directives

Directives zijn speciale attributen met het `v-` prefix.

*   **`v-if`, `v-else-if`, `v-else`**: Conditionele rendering.
    ```html
    <p v-if="type === 'A'">A</p>
    <p v-else-if="type === 'B'">B</p>
    <p v-else>Not A/B</p>
    ```
    `v-if` elementen worden alleen gerenderd als de conditie waar is. Elementen worden vernietigd/gecreëerd bij wijzigingen.

*   **`v-show`**: Conditionele weergave (schakelt CSS `display` eigenschap).
    ```html
    <h1 v-show="ok">Hello!</h1>
    ```
    Elementen met `v-show` worden altijd gerenderd en blijven in de DOM; alleen hun CSS `display` eigenschap wordt geschakeld.

*   **`v-for`**: Lijst-rendering.
    ```html
    <ul id="example-1">
      <li v-for="item in items" :key="item.id">
        {{ item.message }}
      </li>
    </ul>
    <div v-for="(value, key, index) in myObject">
      {{ index }}. {{ key }}: {{ value }}
    </div>
    ```
    Het `:key` attribuut is cruciaal voor Vue om elementen efficiënt te kunnen identificeren en herordenen.

## Event Handling

De `v-on` directive, shorthand `@`, wordt gebruikt om naar DOM-events te luisteren.

```html
<button @click="counter++">Add 1</button>
<button @click="greet">Greet</button>
```

```javascript
// In <script setup>
import { ref } from 'vue'
const counter = ref(0)

function greet(event) {
  alert(`Hello ${name.value}! `)
  // `event` is het native DOM event
  if (event) {
    alert(event.target.tagName)
  }
}
```
Modifiers zoals `.prevent`, `.stop`, `.once`, toets-modifiers (`.enter`, `.tab`) en muisknop-modifiers zijn beschikbaar.

## Form Input Bindingen

De `v-model` directive creëert tweewegs data-binding op formulier-inputs en componenten.

```html
<input v-model="message" placeholder="edit me">
<p>Message is: {{ message }}</p>

<input type="checkbox" id="checkbox" v-model="checked">
<label for="checkbox">{{ checked }}</label>

<select v-model="selected">
  <option disabled value="">Please select one</option>
  <option>A</option>
  <option>B</option>
</select>
```
`v-model` werkt verschillend voor verschillende input types. Modifiers zoals `.lazy`, `.number`, `.trim` zijn beschikbaar.

## Computed Properties

Voor complexere logica die afhankelijk is van reactieve data, gebruik computed properties.
```javascript
// In <script setup>
import { ref, computed } from 'vue'

const author = reactive({
  name: 'John Doe',
  books: [
    'Vue 2 - Advanced Guide',
    'Vue 3 - Basic Guide',
    'Vue 4 - The Mystery'
  ]
})

// een computed ref
const publishedBooksMessage = computed(() => {
  return author.books.length > 0 ? 'Yes' : 'No'
})
```
```html
<p>Heeft gepubliceerde boeken:</p>
<span>{{ publishedBooksMessage }}</span>
```
Computed properties zijn standaard getter-only, maar je kunt ook een setter voorzien als dat nodig is.

## Componenten Basics

Componenten zijn herbruikbare Vue-instanties met een naam.

**Definiëren en Gebruiken (SFC met `<script setup>`):**
```vue
<!-- BlogPost.vue -->
<script setup>
// defineProps wordt gebruikt om props te declareren
const props = defineProps({
  title: String,
  likes: Number
})

// defineEmits wordt gebruikt om events te declareren
const emit = defineEmits(['enlarge-text'])
</script>

<template>
  <h4>{{ title }}</h4>
  <p>Likes: {{ likes }}</p>
  <button @click="emit('enlarge-text')">Enlarge text</button>
</template>
```

```vue
<!-- ParentComponent.vue -->
<script setup>
import { ref } from 'vue'
import BlogPost from './BlogPost.vue'

const posts = ref([
  { id: 1, title: 'My journey with Vue', likes: 10 },
  { id: 2, title: 'Blogging with Vue', likes: 25 }
])

function onEnlargeText() {
  console.log('Enlarge text event received!');
}
</script>

<template>
  <BlogPost
    v-for="post in posts"
    :key="post.id"
    :title="post.title"
    :likes="post.likes"
    @enlarge-text="onEnlargeText"
  />
</template>
```
*   **Props**: Data doorgeven van parent naar child. Props zijn one-way down.
*   **Events**: Communicatie van child naar parent. Children $emit events, parents luisteren ernaar.

## Lifecycle Hooks

Elke componentinstantie doorloopt een reeks initialisatiestappen - bijvoorbeeld, het moet data-observatie opzetten, de template compileren, de instantie aan de DOM mounten, en updaten wanneer data verandert.

Beschikbare hooks (in Composition API met `<script setup>`):
*   `onMounted()`: Geroepen nadat de component gemount is.
*   `onUpdated()`: Geroepen nadat de component geüpdatet is door reactieve datawijzigingen.
*   `onUnmounted()`: Geroepen voordat de component unmounted wordt.

```javascript
// In <script setup>
import { onMounted, onUpdated, onUnmounted } from 'vue'

onMounted(() => {
  console.log(`the component is now mounted.`)
})
```

## Composition API Introductie (in `<script setup>`)

De Composition API is een set van API's die ons toestaat om componentlogica te schrijven als functies.

*   **`setup` attribuut in `<script>` tag**: Geeft aan dat we Composition API gebruiken met minder boilerplate.
*   **`ref()`**: Creëert een reactieve referentie voor primitieve waarden of objecten. Toegang tot de waarde via `.value` in JavaScript.
    ```javascript
    import { ref } from 'vue'
    const count = ref(0)
    console.log(count.value) // 0
    count.value++
    ```
*   **`reactive()`**: Creëert een reactief object. (Voorheen `Vue.observable()`)
    ```javascript
    import { reactive } from 'vue'
    const state = reactive({ count: 0 })
    state.count++
    ```
*   **Lifecycle Hooks**: Zoals `onMounted`, `onUpdated`, `onUnmounted`.
*   **`computed()`**: Voor computed properties.
*   **`watch()` en `watchEffect()`**: Om te reageren op datawijzigingen.

*Bron: Gebaseerd op Vue.js Officiële Documentatie (vuejs.org/guide/essentials/)*
