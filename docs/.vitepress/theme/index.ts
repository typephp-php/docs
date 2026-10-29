import DefaultTheme from 'vitepress/theme'
import type { Theme } from 'vitepress'
import { h, onMounted, watch, nextTick } from 'vue'
import { useRoute, useRouter } from 'vitepress'
import GitHubStars from './components/GitHubStars.vue'
import TypePHPSnippet from './components/TypePHPSnippet.vue'
import { enhanceDocblocksInDocument } from './utils/docblock-highlighter' 
import './custom.css'

function enableTableSorting() {
  const tables = document.querySelectorAll('.vp-doc table')

  tables.forEach((table) => {
    const headers = table.querySelectorAll('th')

    headers.forEach((header, colIndex) => {
      header.classList.add('sortable-header')
      header.title = 'Click to sort'

      let asc = true
      header.onclick = () => {
        const tbody = table.querySelector('tbody') || table
        const rows = Array.from(tbody.querySelectorAll('tr')).filter(
          (row) => !row.querySelector('th')
        )

        rows.sort((a, b) => {
          const aText = a.children[colIndex]?.textContent?.trim() || ''
          const bText = b.children[colIndex]?.textContent?.trim() || ''

          const aNum = parseFloat(aText.replace(/[^0-9.-]/g, ''))
          const bNum = parseFloat(bText.replace(/[^0-9.-]/g, ''))

          if (!isNaN(aNum) && !isNaN(bNum)) {
            return asc ? aNum - bNum : bNum - aNum
          }
          return asc ? aText.localeCompare(bText) : bText.localeCompare(aText)
        })

        asc = !asc
        rows.forEach((row) => tbody.appendChild(row))
      }
    })
  })
}

function checkAndRedirect(path: string): boolean {
  if (typeof window === 'undefined') return false

  if (path.startsWith('/docs/blog/')) {
    const target = path.replace('/docs/blog/', '/blog/')
    window.location.replace(target + window.location.search + window.location.hash)
    return true
  }

  const docsSections = [
    '/getting-started',
    '/core-concepts',
    '/supported-types',
    '/generics',
    '/testing',
    '/advanced',
    '/production',
    '/troubleshooting',
  ]

  for (const section of docsSections) {
    if (path.startsWith(section) && !path.startsWith('/docs/')) {
      const target = '/docs' + path + window.location.search + window.location.hash
      window.location.replace(target)
      return true
    }
  }

  return false
}

export default {
  extends: DefaultTheme,
  Layout() {
    return h(DefaultTheme.Layout, null, {
      'nav-bar-content-after': () => h(GitHubStars),
    })
  },
  enhanceApp({ app }) {
    app.component('TypePHPSnippet', TypePHPSnippet)
  },
  setup() {
    const route = useRoute()

    onMounted(() => {
      if (checkAndRedirect(window.location.pathname)) {
        return
      }

      enableTableSorting()
      enhanceDocblocksInDocument() // 👈 Run on page mount

      if (typeof window !== 'undefined' && 'serviceWorker' in navigator) {
        navigator.serviceWorker.getRegistrations().then((registrations) => {
          for (const registration of registrations) {
            registration.unregister()
          }
        })
      }
    })

    watch(
      () => route.path,
      (newPath) => {
        if (!checkAndRedirect(newPath)) {
          nextTick(() => {
            enableTableSorting()
            enhanceDocblocksInDocument() 
          })
        }
      }
    )
  }
} satisfies Theme