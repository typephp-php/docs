import { defineConfig } from 'vitepress'
import { withMermaid } from 'vitepress-plugin-mermaid'

export default withMermaid(
  defineConfig({
    title: "TypePHP",
    description: "Transparent Runtime Type Enforcement for PHP.",
    base: '/', 
    cleanUrls: true,
    
    rewrites: {
      'getting-started/:page*': 'docs/getting-started/:page*',
      'core-concepts/:page*': 'docs/core-concepts/:page*',
      'supported-types/:page*': 'docs/supported-types/:page*',
      'generics/:page*': 'docs/generics/:page*',
      'testing/:page*': 'docs/testing/:page*',
      'advanced/:page*': 'docs/advanced/:page*',
      'production/:page*': 'docs/production/:page*',
      'troubleshooting.md': 'docs/troubleshooting.md'
    },

    sitemap: {
      hostname: 'https://typephp.dev/'
    },

    head: [
      ['link', { rel: 'icon', type: 'image/svg+xml', href: '/favicon.svg' }],
      ['link', { rel: 'alternate icon', href: '/favicon.ico' }],
      ['meta', { name: 'theme-color', content: '#3b82f6' }],
      ['meta', { name: 'author', content: 'Reymart Calicdan' }],
      ['meta', { name: 'keywords', content: 'TypePHP, PHP, Runtime Type Safety, Reified Generics, PHPDoc, PHPStan, Psalm, Pest, Type Enforcement, Static Analysis' }],
      ['link', { rel: 'prefetch', href: '/wasm/typephp-runtime.json.gz', as: 'fetch', crossorigin: 'anonymous' }],
      ['link', { rel: 'prefetch', href: '/wasm/typephp-runtime.json', as: 'fetch' }],

      [
        'script',
        { type: 'application/ld+json' },
        JSON.stringify({
          '@context': 'https://schema.org',
          '@type': 'SoftwareApplication',
          'name': 'TypePHP',
          'operatingSystem': 'Cross-platform',
          'applicationCategory': 'DeveloperApplication',
          'description': 'Transparent Runtime Type Enforcement for PHP.',
          'url': 'https://typephp.dev/',
          'author': {
            '@type': 'Person',
            'name': 'Reymart Calicdan',
            'url': 'https://github.com/rcalicdan'
          },
          'offers': {
            '@type': 'Offer',
            'price': '0',
            'priceCurrency': 'USD'
          }
        })
      ]
    ],

    transformHead({ pageData }) {
      const siteUrl = 'https://typephp.dev/';
      let routePath = pageData.relativePath
        .replace(/index\.md$/, '')
        .replace(/\.md$/, '');

      const docsFolders = [
        'getting-started', 'core-concepts', 'supported-types', 
        'generics', 'testing', 'advanced', 'production', 'troubleshooting'
      ];
      const firstSegment = routePath.split('/')[0];
      if (docsFolders.includes(firstSegment)) {
        routePath = `docs/${routePath}`;
      }

      const canonicalUrl = `${siteUrl}${routePath}`;
      const rawTitle = pageData.title || 'TypePHP';
      const pageTitle = rawTitle.includes('TypePHP') ? rawTitle : `${rawTitle} | TypePHP`;
      const pageDescription = pageData.description || 'Transparent Runtime Type Enforcement for PHP. Bringing reified generics, typed arrays, and 1-pass audit reporting to life with zero C-extensions.';

      return [
        ['link', { rel: 'canonical', href: canonicalUrl }],
        ['meta', { property: 'og:site_name', content: 'TypePHP' }],
        ['meta', { property: 'og:type', content: pageData.relativePath.startsWith('blog/') ? 'article' : 'website' }],
        ['meta', { property: 'og:title', content: pageTitle }],
        ['meta', { property: 'og:description', content: pageDescription }],
        ['meta', { property: 'og:url', content: canonicalUrl }],
        ['meta', { property: 'og:image', content: `${siteUrl}favicon.svg` }],
        ['meta', { name: 'twitter:card', content: 'summary' }],
        ['meta', { name: 'twitter:site', content: '@typephp' }],
        ['meta', { name: 'twitter:title', content: pageTitle }],
        ['meta', { name: 'twitter:description', content: pageDescription }],
        ['meta', { name: 'twitter:image', content: `${siteUrl}favicon.svg` }],
      ];
    },

    markdown: {
      math: true
    },

    vite: {
      assetsInclude: [/\.dat$/, /\.wasm$/, /\.so$/],
      worker: {
        format: 'es',
      },
      optimizeDeps: {
        include: [
          'fastdom',
          'fastdom/extensions/fastdom-promised.js',
          'dayjs',
          'dayjs/plugin/customParseFormat.js',
          'dayjs/plugin/advancedFormat.js',
          'dayjs/plugin/isoWeek.js',
        ],
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
        { text: 'Documentation', link: '/docs/getting-started/installation' },
        { text: 'Playground', link: '/playground' },
        { text: 'Generics', link: '/docs/generics/class-generics-and-upper-bounds' },
        { text: 'Blog', link: '/blog/' },
      ],
      sidebar: [
        {
          text: 'Getting Started',
          items: [
            { text: 'Installation', link: '/docs/getting-started/installation' },
            { text: 'Quick Start', link: '/docs/getting-started/quick-start' },
            { text: 'Configuration', link: '/docs/getting-started/configuration' },
            { text: 'CLI Commands Reference', link: '/docs/getting-started/cli-commands' },
          ]
        },
        {
          text: 'Enforcement Boundaries',
          items: [
            { text: 'Function & Method Contracts', link: '/docs/core-concepts/function-contracts' },
            { text: 'Liskov & DocBlock Inheritance', link: '/docs/core-concepts/liskov-and-inheritance' },
            { text: 'Inline Variables & Destructuring', link: '/docs/core-concepts/inline-variables' },
            { text: 'Class Property Validation & Hooks', link: '/docs/core-concepts/property-validation' },
            { text: 'By-Reference Contracts & Mutations', link: '/docs/core-concepts/by-reference-contracts' },
            { text: 'Magic Annotations (@property & @method)', link: '/docs/core-concepts/magic-annotations' },
          ]
        },
        {
          text: 'Type Reference & Algebra',
          items: [
            { text: 'Primitives, Ranges & Refinements', link: '/docs/supported-types/primitives-and-scalars' },
            { text: 'Arrays, Lists & Shape Composition', link: '/docs/supported-types/arrays-and-shapes' },
            { text: 'Callables & Closures', link: '/docs/supported-types/callables-and-closures' },
            { text: 'Iterators & Generators', link: '/docs/supported-types/iterators-and-generators' },
            { text: 'Unions, Intersections & Conditionals', link: '/docs/supported-types/unions-intersections-and-conditionals' },
            { text: 'Type Aliases (@phpstan-type)', link: '/docs/supported-types/type-aliases' },
          ]
        },
        {
          text: 'Runtime Generics (Flagship)',
          items: [
            { text: 'Class Generics & Upper Bounds', link: '/docs/generics/class-generics-and-upper-bounds' },
            { text: 'Function & Static Method Generics', link: '/docs/generics/function-and-static-method-generics' },
            { text: 'Generic Variance', link: '/docs/generics/generic-variance' },
            { text: 'Inheritance, Interfaces & Traits', link: '/docs/generics/inheritance-interfaces-and-traits' },
            { text: 'Advanced Generic Patterns', link: '/docs/generics/advanced-generic-patterns' },
            { text: 'Cloning Generic Objects', link: '/docs/generics/cloning-generic-objects' },
          ]
        },
        {
          text: 'Testing & Codebase Auditing',
          items: [
            { text: 'Pest & PHPUnit Integration', link: '/docs/testing/pest-and-phpunit' },
            { text: 'Violation Reporting & Auditing', link: '/docs/testing/violation-reporting' },
          ]
        },
        {
          text: 'Architecture & Optimization',
          items: [
            { text: 'How It Works (StreamWrapper & LTW)', link: '/docs/advanced/how-it-works' },
            { text: 'Compile-Time Check Elimination', link: '/docs/advanced/compile-time-elimination' },
            { text: 'Stub Files (Third-Party Overrides)', link: '/docs/advanced/stubs' },
            { text: 'Vendor Isolation & Path Filtering', link: '/docs/advanced/vendor-and-path-filtering' },
            { text: 'Ignore Annotations (@typephp-ignore)', link: '/docs/advanced/ignore-annotations' },
            { text: 'Building Extensions', link: '/docs/advanced/extensions' },
            { text: 'Exception Handling', link: '/docs/advanced/exception-handling' },
          ]
        },
        {
          text: 'Production & Performance',
          items: [
            { text: 'Production Readiness & Strategy', link: '/docs/production/production-readiness' },
            { text: 'Performance & JIT Benchmarks', link: '/docs/production/performance-considerations' },
          ]
        },
        {
          text: 'Community & Support',
          items: [
            { text: 'Troubleshooting & FAQ', link: '/docs/troubleshooting' },
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
)