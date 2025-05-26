import { computed, type ComputedRef } from 'vue'

export function useMarkdown() {
    /**
     * Create a computed property that converts markdown text to HTML
     * This is a simple markdown parser for basic formatting
     */
    const createMarkdownComputed = (textGetter: () => string): ComputedRef<string> => {
        return computed(() => {
            const text = textGetter()
            if (!text) return ''

            return text
                // Convert headers
                .replace(/^### (.*$)/gim, '<h3>$1</h3>')
                .replace(/^## (.*$)/gim, '<h2>$1</h2>')
                .replace(/^# (.*$)/gim, '<h1>$1</h1>')

                // Convert bold text
                .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
                .replace(/__(.*?)__/g, '<strong>$1</strong>')

                // Convert italic text
                .replace(/\*(.*?)\*/g, '<em>$1</em>')
                .replace(/_(.*?)_/g, '<em>$1</em>')

                // Convert line breaks to proper HTML
                .replace(/\n\n/g, '</p><p>')
                .replace(/\n/g, '<br>')

                // Wrap in paragraph tags if not already in HTML tags
                .replace(/^(?!<[h1-6]|<p|<ul|<ol|<li|<div|<br)/gm, '<p>')
                .replace(/(?<!>)$/gm, '</p>')

                // Clean up empty paragraphs
                .replace(/<p><\/p>/g, '')
                .replace(/<p><br><\/p>/g, '<br>')

                // Convert numbered lists
                .replace(/^\d+\.\s+(.*?)(?=\n|$)/gm, '<li>$1</li>')
                .replace(/(<li>.*<\/li>)/s, '<ol>$1</ol>')

                // Convert bullet lists
                .replace(/^[-*+]\s+(.*?)(?=\n|$)/gm, '<li>$1</li>')
                .replace(/(<li>.*<\/li>)/s, '<ul>$1</ul>')

                // Clean up consecutive list items
                .replace(/<\/ol>\s*<ol>/g, '')
                .replace(/<\/ul>\s*<ul>/g, '')

                // Final cleanup
                .trim()
        })
    }

    /**
     * Simple function to convert markdown text to HTML
     */
    const markdownToHtml = (text: string): string => {
        if (!text) return ''

        return createMarkdownComputed(() => text).value
    }

    return {
        createMarkdownComputed,
        markdownToHtml
    }
}
