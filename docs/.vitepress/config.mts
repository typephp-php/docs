import { defineConfig } from 'vitepress'

export default defineConfig({
  title: "TypePHP",
  description: "Transparent Runtime Type Enforcement for PHP.",
  base: '/docs/',
  cleanUrls: true,
  head: [
    ['link', { rel: 'icon', type: 'image/svg+xml', href: '/docs/favicon.svg' }],
    ['link', { rel: 'alternate icon', href: '/docs/favicon.ico' }],
    ['link', { rel: 'preload', href: '/docs/wasm/typephp-runtime.json.gz', as: 'fetch', crossorigin: 'anonymous' }],
    ['link', { rel: 'prefetch', href: '/docs/wasm/typephp-runtime.json', as: 'fetch' }]
  ],

  markdown: {
    math: true
  },

  vite: {
    assetsInclude: [/\.dat$/, /\.wasm$/, /\.so$/],
    worker: {
      format: 'es',
    },
    optimizeDeps: {
      esbuildOptions: {
        loader: {
          '.dat': 'file',
          '.so': 'file',
          '.wasm': 'file',
        },
      },
      exclude: ['@php-wasm/web-7-4', '@php-wasm/web-8-0', '@php-wasm/web-8-1', '@php-wasm/web-8-2', '@php-wasm/web-8-3', '@php-wasm/web-8-4']
    },
    build: {
      target: 'esnext'
    }
  },

  themeConfig: {
    siteTitle: "TypePHP",
    logo: '/favicon.svg',
    nav: [
      { text: 'Home', link: '/' },
      { text: 'Documentation', link: '/getting-started/installation' },
      { text: 'Playground', link: '/playground' },
      { text: 'Generics', link: '/generics/basics-and-bounds' },
      { text: 'Blog', link: '/blog/' },
    ],
    sidebar: [
      {
        text: 'Getting Started',
        items: [
          { text: 'Installation', link: '/getting-started/installation' },
          { text: 'Quick Start', link: '/getting-started/quick-start' },
          { text: 'Configuration', link: '/getting-started/configuration' },
          { text: 'CLI Commands Reference', link: '/getting-started/cli-commands' },
        ]
      },
      {
        text: 'Testing & Codebase Auditing',
        items: [
          { text: 'Pest & PHPUnit Integration', link: '/testing/pest-and-phpunit' },
          { text: 'Violation Reporting & Auditing', link: '/core-concepts/violation-reporting' },
        ]
      },
      {
        text: 'Runtime Generics (Flagship)',
        items: [
          { text: 'Class Generics & Upper Bounds', link: '/generics/class-generics-and-upper-bounds' },
          { text: 'Function & Static Method Generics', link: '/generics/function-and-static-method-generics' },
          { text: 'Generic Variance', link: '/generics/generic-variance' },
          { text: 'Inheritance, Interfaces & Traits', link: '/generics/inheritance-interfaces-and-traits' },
          { text: 'Advanced Generic Patterns', link: '/generics/advanced-generic-patterns' },
          { text: 'Cloning Generic Objects', link: '/generics/cloning-generic-objects' },
        ]
      },
      {
        text: 'Enforcement Boundaries',
        items: [
          { text: 'Function & Method Contracts', link: '/core-concepts/function-contracts' },
          { text: 'Inline Variables & Destructuring', link: '/core-concepts/inline-variables' },
          { text: 'Class Property Validation & Hooks', link: '/core-concepts/property-validation' },
          { text: 'By-Reference Contracts & Mutations', link: '/core-concepts/by-reference-contracts' },
          { text: 'Magic Annotations (@property & @method)', link: '/core-concepts/magic-annotations' },
        ]
      },
      {
        text: 'Type Reference & Algebra',
        items: [
          { text: 'Primitives, Ranges & Refinements', link: '/supported-types/primitives-and-scalars' },
          { text: 'Arrays, Lists & Shape Composition', link: '/supported-types/arrays-and-shapes' },
          { text: 'Callables & Closures', link: '/supported-types/callables-and-closures' },
          { text: 'Iterators & Generators', link: '/supported-types/iterators-and-generators' },
          { text: 'Unions, Intersections & Conditionals', link: '/supported-types/unions-intersections-and-conditionals' },
          { text: 'Type Aliases (@phpstan-type)', link: '/supported-types/type-aliases' },
        ]
      },
      {
        text: 'Architecture & Optimization',
        items: [
          { text: 'How It Works (StreamWrapper & LTW)', link: '/advanced/how-it-works' },
          { text: 'Compile-Time Check Elimination', link: '/advanced/compile-time-elimination' },
          { text: 'Liskov Substitution & Inheritance', link: '/advanced/liskov-and-inheritance' },
          { text: 'Stub Files (Third-Party Overrides)', link: '/advanced/stubs' },
          { text: 'Vendor Isolation & Path Filtering', link: '/advanced/vendor-and-path-filtering' },
          { text: 'Ignore Annotations (@typephp-ignore)', link: '/advanced/ignore-annotations' },
          { text: 'Building Extensions', link: '/advanced/extensions' },
          { text: 'Exception Handling', link: '/advanced/exception-handling' },
        ]
      },
      {
        text: 'Production & Performance',
        items: [
          { text: 'Production Readiness & Strategy', link: '/production/production-readiness' },
          { text: 'Performance & JIT Benchmarks', link: '/production/performance-considerations' },
        ]
      },
      {
        text: 'Community & Support',
        items: [
          { text: 'Troubleshooting & FAQ', link: '/troubleshooting' },
          { text: 'Blog & Announcements', link: '/blog/' },
        ]
      }
    ],
    socialLinks: [],
    search: {
      provider: 'local'
    }
  }
})