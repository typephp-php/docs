<template>
    <div class="blog-feed-container">
        <div class="blog-feed">
            <article v-for="post in paginatedPosts" :key="post.url" class="blog-post-card">
                <div class="blog-post-meta">
                    <span :class="['blog-badge', post.badgeClass || 'badge-guide']">
                        {{ post.badge }}
                    </span>
                    <time>{{ post.date }}</time>
                    <span class="dot">•</span>
                    <span>{{ post.readTime }}</span>
                </div>

                <h2 class="blog-post-title">
                    <a :href="post.url">{{ post.title }}</a>
                </h2>

                <p class="blog-post-excerpt">
                    {{ post.excerpt }}
                </p>

                <div class="blog-post-footer">
                    <a class="blog-read-more" :href="post.url">Read Article →</a>
                </div>
            </article>
        </div>

        <div v-if="totalPages > 1" class="blog-pagination">
            <button class="pagination-btn" :disabled="currentPage === 1" @click="goToPage(currentPage - 1)">
                ← Newer
            </button>

            <div class="pagination-pages">
                <button v-for="page in totalPages" :key="page"
                    :class="['page-number', { active: currentPage === page }]" @click="goToPage(page)">
                    {{ page }}
                </button>
            </div>

            <button class="pagination-btn" :disabled="currentPage === totalPages" @click="goToPage(currentPage + 1)">
                Older →
            </button>
        </div>
    </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'
import rawPosts from '../../data/posts.json'

export interface BlogPost {
    title: string
    url: string
    date: string
    readTime: string
    badge: string
    badgeClass?: string
    excerpt: string
}

const posts: BlogPost[] = rawPosts
const POSTS_PER_PAGE = 5
const currentPage = ref(1)

const totalPages = computed(() => Math.ceil(posts.length / POSTS_PER_PAGE))

const paginatedPosts = computed(() => {
    const start = (currentPage.value - 1) * POSTS_PER_PAGE
    return posts.slice(start, start + POSTS_PER_PAGE)
})

function goToPage(page: number) {
    if (page >= 1 && page <= totalPages.value) {
        currentPage.value = page
        window.scrollTo({ top: 0, behavior: 'smooth' })
    }
}
</script>