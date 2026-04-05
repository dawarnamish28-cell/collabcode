/**
 * Custom App Component
 * Wraps all pages with global providers and styles
 */

import '../styles/globals.css';
import { AppProvider } from '../context/AppContext';
import Head from 'next/head';

export default function App({ Component, pageProps }) {
  return (
    <AppProvider>
      <Head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <meta name="theme-color" content="#1e1e1e" />
        <link rel="icon" href="data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><text y='.9em' font-size='90'>&#x1F4BB;</text></svg>" />
        <title>CollabCode - Collaborative Code Editor</title>
      </Head>
      <Component {...pageProps} />
    </AppProvider>
  );
}
