/**
 * Custom App Component
 * Wraps all pages with global providers and styles
 * 
 * v18: Enhanced meta tags, OG tags for sharing, favicon
 * made with <3 by Namish
 */

import '../styles/globals.css';
import { AppProvider } from '../context/AppContext';
import Head from 'next/head';

export default function App({ Component, pageProps }) {
  return (
    <AppProvider>
      <Head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1" />
        <meta name="theme-color" content="#131416" />
        <meta name="description" content="Real-time collaborative coding platform. Pair program with anyone — 20 languages, CRDT sync, voice chat, and code execution in the browser." />
        <meta name="keywords" content="collaborative coding, pair programming, real-time editor, code execution, voice chat, Monaco editor, CRDT, WebRTC" />
        <meta name="author" content="Namish" />

        {/* Open Graph / Social Sharing */}
        <meta property="og:type" content="website" />
        <meta property="og:title" content="CollabCode — Real-Time Collaborative Coding" />
        <meta property="og:description" content="Code together in real-time. 20 languages, voice chat, CRDT sync — no setup needed." />
        <meta property="og:site_name" content="CollabCode" />

        {/* Twitter Card */}
        <meta name="twitter:card" content="summary" />
        <meta name="twitter:title" content="CollabCode — Real-Time Collaborative Coding" />
        <meta name="twitter:description" content="Code together in real-time. 20 languages, voice chat, CRDT sync." />

        {/* Favicon - code brackets icon */}
        <link rel="icon" href="data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><text y='.9em' font-size='90'>⌨️</text></svg>" />

        <title>CollabCode — Collaborative Code Editor</title>
      </Head>
      <Component {...pageProps} />
    </AppProvider>
  );
}
