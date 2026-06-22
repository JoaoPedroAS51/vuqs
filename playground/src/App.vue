<script setup lang="ts">
import { computed, ref, watchEffect } from 'vue'
import { provideVueRouterAdapter } from 'vuqs/adapters/vue-router'
import { RouterLink, RouterView } from 'vue-router'

// One adapter for the whole app: descendant useQueryState/useQueryStates calls
// resolve `query` + `navigate` from here. Default to `replace` so the demos do
// not flood the browser history while you tinker.
provideVueRouterAdapter({ defaultOptions: { history: 'replace' } })

type Mode = 'system' | 'light' | 'dark'
type Theme = 'dark' | 'light'

const STORAGE_KEY = 'vuqs-theme'
const media = matchMedia('(prefers-color-scheme: dark)')

const modes: { value: Mode, label: string }[] = [
  { value: 'system', label: 'System' },
  { value: 'light', label: 'Light' },
  { value: 'dark', label: 'Dark' },
]

function getInitialMode(): Mode {
  const saved = localStorage.getItem(STORAGE_KEY)

  return saved === 'system' || saved === 'light' || saved === 'dark' ? saved : 'system'
}

const mode = ref<Mode>(getInitialMode())
const systemTheme = ref<Theme>(media.matches ? 'dark' : 'light')

// Follow the OS while in system mode, reacting to changes without a reload.
media.addEventListener('change', (event) => {
  systemTheme.value = event.matches ? 'dark' : 'light'
})

const theme = computed<Theme>(() => (mode.value === 'system' ? systemTheme.value : mode.value))

watchEffect(() => {
  const root = document.documentElement
  root.setAttribute('data-theme', theme.value)
  root.style.colorScheme = theme.value
  // Keep the inline html background (set pre-paint in index.html) in sync with the
  // active palette, so changing theme without a reload doesn't leave a stale-colored
  // band under short pages.
  root.style.backgroundColor = getComputedStyle(root).getPropertyValue('--bg').trim()
})

function setMode(next: Mode) {
  mode.value = next
  localStorage.setItem(STORAGE_KEY, next)
}
</script>

<template>
  <header class="topbar">
    <div class="brand">
      <span class="name">vuqs</span>
      <span class="sub">playground</span>
    </div>
    <nav class="tabs">
      <RouterLink to="/">Overview</RouterLink>
      <RouterLink to="/single">Single + codecs</RouterLink>
      <RouterLink to="/grouped">Grouped</RouterLink>
      <RouterLink to="/store">Store</RouterLink>
      <RouterLink to="/context">Context</RouterLink>
    </nav>
    <div class="theme-switch" role="radiogroup" aria-label="Theme">
      <button
        v-for="option in modes"
        :key="option.value"
        type="button"
        role="radio"
        :class="{ active: mode === option.value }"
        :aria-checked="mode === option.value"
        :aria-label="`${option.label} theme`"
        :title="option.label"
        @click="setMode(option.value)"
      >
        <svg v-if="option.value === 'system'" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <rect x="2" y="3" width="20" height="14" rx="2" />
          <path d="M8 21h8M12 17v4" />
        </svg>
        <svg v-else-if="option.value === 'light'" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <circle cx="12" cy="12" r="4" />
          <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41" />
        </svg>
        <svg v-else width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
        </svg>
      </button>
    </div>
  </header>

  <main>
    <RouterView />
  </main>
</template>
