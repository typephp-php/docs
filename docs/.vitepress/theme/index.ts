import DefaultTheme from 'vitepress/theme'
import type { Theme } from 'vitepress'
import { h, onMounted, watch, nextTick } from 'vue'
import { useRoute } from 'vitepress'
import GitHubStars from './components/GitHubStars.vue'
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

export default {
  extends: DefaultTheme,
  Layout() {
    return h(DefaultTheme.Layout, null, {
      'nav-bar-content-after': () => h(GitHubStars),
    })
  },
  setup() {
    const route = useRoute()

    onMounted(() => {
      enableTableSorting()
    })

    watch(
      () => route.path,
      () => {
        nextTick(() => {
          enableTableSorting()
        })
      }
    )
  }
} satisfies Theme