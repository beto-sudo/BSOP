"use client";

import React from "react";

type Props = { children: React.ReactNode; fallback?: React.ReactNode };
type State = { hasError: boolean; error?: unknown };

export default class ErrorBoundary extends React.Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(error: unknown) {
    return { hasError: true, error };
  }

  componentDidCatch(error: unknown, errorInfo: unknown) {
    // Log útil en consola del navegador/Logs de Vercel
    // eslint-disable-next-line no-console
    console.error("[Layout runtime error]", error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        this.props.fallback ?? (
          <div style={{ padding: 16, fontFamily: "ui-sans-serif, system-ui" }}>
            <h1 style={{ fontWeight: 600, marginBottom: 8 }}>Algo falló al renderizar</h1>
            <p style={{ opacity: 0.8, marginBottom: 12 }}>
              Revisé de tu lado para no dejar la pantalla en blanco. Checa la consola para el stack trace.
            </p>
          </div>
        )
      );
    }
    return this.props.children;
  }
}
