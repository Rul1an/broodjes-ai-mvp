/// <reference types="vite/client" />
/// <reference types="vite-plugin-vue-devtools/global" />

declare module '*.vue' {
  import type { DefineComponent } from 'vue'
  const component: DefineComponent<{}, {}, any>
  export default component
}

declare module '*.md' {
  const content: string
  export default content
}
