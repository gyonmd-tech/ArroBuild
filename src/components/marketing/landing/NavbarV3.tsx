/* eslint-disable @next/next/no-img-element */
"use client";

import { useEffect, useState, useRef } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { getDisplayName } from "@/lib/display-name";

const NAV_LINKS = [
  { href: "/learn", label: "Belajar" },
  { href: "/tools", label: "Mini Tools" },
  { href: "/generate", label: "Generate" },
  { href: "/#pricing", label: "Harga" },
];

interface AuthUser {
  name: string | null;
  email: string;
  avatarUrl: string | null;
}

function NavAccountButton({
  user,
  className,
  onClick,
}: {
  user: AuthUser;
  className?: string;
  onClick?: () => void;
}) {
  const displayName = getDisplayName(user.name, user.email);
  const initial = displayName[0]?.toUpperCase() ?? "A";

  return (
    <Link
      href="/dashboard"
      onClick={onClick}
      className={className}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 8,
        padding: "6px 14px",
        borderRadius: 999,
        textDecoration: "none",
        background: "rgba(255,255,255,0.05)",
        transition: "background 0.2s, transform 0.15s",
      }}
      onMouseEnter={(e) => {
        const el = e.currentTarget;
        el.style.background = "rgba(255,255,255,0.1)";
        el.style.transform = "translateY(-1px)";
      }}
      onMouseLeave={(e) => {
        const el = e.currentTarget;
        el.style.background = "rgba(255,255,255,0.05)";
        el.style.transform = "translateY(0)";
      }}
    >
      {user.avatarUrl ? (
        <img
          src={user.avatarUrl}
          alt=""
          style={{
            width: 20,
            height: 20,
            borderRadius: "50%",
            objectFit: "cover",
          }}
        />
      ) : (
        <span
          style={{
            width: 20,
            height: 20,
            borderRadius: "50%",
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            fontFamily: "var(--font-jetbrains-mono)",
            fontSize: 10,
            fontWeight: 700,
            background: "rgba(255,176,32,0.1)",
            color: "var(--lp-amber)",
          }}
        >
          {initial}
        </span>
      )}
      <span
        style={{
          fontFamily: "var(--font-jetbrains-mono)",
          fontSize: 12,
          fontWeight: 600,
          color: "var(--lp-text-primary)",
        }}
      >
        Dashboard
      </span>
    </Link>
  );
}

function NodeMark() {
  return (
    <svg width="24" height="24" viewBox="0 0 28 28" fill="none">
      <line x1="14" y1="6" x2="22" y2="20" stroke="rgba(255,255,255,0.15)" strokeWidth="1.5" />
      <line x1="14" y1="6" x2="6" y2="20" stroke="rgba(255,255,255,0.15)" strokeWidth="1.5" />
      <line x1="22" y1="20" x2="6" y2="20" stroke="rgba(255,255,255,0.15)" strokeWidth="1.5" />
      <circle cx="14" cy="6" r="4" fill="#FFB020" />
      <circle cx="22" cy="20" r="3" fill="#38BDF8" />
      <circle cx="6" cy="20" r="2.5" fill="#FFFFFF" />
    </svg>
  );
}

export default function NavbarV3({ solid = false }: { solid?: boolean }) {
  const pathname = usePathname();
  const [scrolled, setScrolled] = useState(false);
  const [hidden, setHidden] = useState(false);
  const lastScrollY = useRef(0);
  const [menuOpen, setMenuOpen] = useState(false);
  const [user, setUser] = useState<AuthUser | null>(null);

  useEffect(() => {
    if (solid) return;
    const onScroll = () => {
      const currentScrollY = window.scrollY;
      setScrolled(currentScrollY > 20);
      
      if (currentScrollY > lastScrollY.current && currentScrollY > 100 && !menuOpen) {
        setHidden(true);
      } else {
        setHidden(false);
      }
      lastScrollY.current = currentScrollY;
    };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, [solid, menuOpen]);

  useEffect(() => {
    document.body.style.overflow = menuOpen ? "hidden" : "";
    return () => { document.body.style.overflow = ""; };
  }, [menuOpen]);

  useEffect(() => {
    try {
      const supabase = createClient();
      supabase.auth.getSession().then(({ data }) => {
        const authUser = data.session?.user;
        if (authUser) {
          setUser({
            name: authUser.user_metadata?.full_name || authUser.user_metadata?.name || null,
            email: authUser.email || "",
            avatarUrl: (authUser.user_metadata?.avatar_url as string) ?? null,
          });
        }
      });
    } catch {}
  }, []);

  const showSolid = solid || scrolled;
  const navBg = showSolid ? "var(--lp-bg-base)" : "transparent";

  function isActive(href: string) {
    if (href === "/tools") return pathname === "/tools" || pathname.startsWith("/tools/");
    if (href === "/learn") return pathname === "/learn" || pathname.startsWith("/learn/");
    if (href === "/generate") return pathname === "/generate" || pathname.startsWith("/generate/");
    if (href.startsWith("/#")) return false;
    return pathname === href;
  }

  return (
    <>
      <nav
        style={{
          position: "fixed",
          top: 0,
          left: 0,
          right: 0,
          zIndex: 200,
          background: navBg,
          transition: "background 0.3s, transform 0.3s cubic-bezier(0.16, 1, 0.3, 1)",
          transform: hidden ? "translateY(-100%)" : "translateY(0)",
          borderBottom: showSolid ? "1px solid rgba(255,255,255,0.03)" : "1px solid transparent",
        }}
      >
        <div
          style={{
            maxWidth: 1200,
            margin: "0 auto",
            padding: "0 24px",
            height: 72,
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          {/* Logo */}
          <Link
            href="/"
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              textDecoration: "none",
            }}
          >
            <NodeMark />
            <span
              style={{
                fontFamily: "var(--font-unbounded)",
                fontWeight: 800,
                fontSize: 16,
                letterSpacing: "-0.02em",
                color: "var(--lp-text-primary)",
              }}
            >
              Arro<span style={{ color: "var(--lp-amber)" }}>Build</span>
            </span>
          </Link>

          {/* Desktop Nav */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 40,
            }}
            className="nav-desktop"
          >
            {NAV_LINKS.map((link) => {
              const active = isActive(link.href);
              return (
                <Link
                  key={link.href}
                  href={link.href}
                  style={{
                    fontFamily: "var(--font-jetbrains-mono)",
                    fontSize: 12,
                    fontWeight: 500,
                    letterSpacing: "0.02em",
                    color: active ? "var(--lp-text-primary)" : "var(--lp-text-tertiary)",
                    textDecoration: "none",
                    transition: "color 0.2s",
                  }}
                  onMouseEnter={(e) => { (e.currentTarget as HTMLAnchorElement).style.color = "var(--lp-text-primary)"; }}
                  onMouseLeave={(e) => { (e.currentTarget as HTMLAnchorElement).style.color = active ? "var(--lp-text-primary)" : "var(--lp-text-tertiary)"; }}
                >
                  {link.label}
                </Link>
              );
            })}
          </div>

          {/* Auth CTA */}
          <div style={{ display: "flex", alignItems: "center", gap: 16 }} className="nav-desktop">
            {user ? (
              <NavAccountButton user={user} />
            ) : (
              <>
                <Link
                  href="/login"
                  style={{
                    fontFamily: "var(--font-jetbrains-mono)",
                    fontSize: 12,
                    fontWeight: 500,
                    color: "var(--lp-text-tertiary)",
                    textDecoration: "none",
                    transition: "color 0.2s",
                  }}
                  onMouseEnter={(e) => { (e.currentTarget as HTMLAnchorElement).style.color = "var(--lp-text-primary)"; }}
                  onMouseLeave={(e) => { (e.currentTarget as HTMLAnchorElement).style.color = "var(--lp-text-tertiary)"; }}
                >
                  Masuk
                </Link>
                <Link
                  href="/signup"
                  style={{
                    fontFamily: "var(--font-jetbrains-mono)",
                    fontSize: 12,
                    fontWeight: 700,
                    background: "var(--lp-text-primary)",
                    color: "var(--lp-bg-base)",
                    padding: "8px 16px",
                    borderRadius: 999,
                    textDecoration: "none",
                    transition: "transform 0.15s, opacity 0.2s",
                  }}
                  onMouseEnter={(e) => { (e.currentTarget as HTMLAnchorElement).style.opacity = "0.9"; (e.currentTarget as HTMLAnchorElement).style.transform = "translateY(-1px)"; }}
                  onMouseLeave={(e) => { (e.currentTarget as HTMLAnchorElement).style.opacity = "1"; (e.currentTarget as HTMLAnchorElement).style.transform = "translateY(0)"; }}
                >
                  Mulai
                </Link>
              </>
            )}
          </div>

          {/* Mobile Hamburger */}
          <button type="button"
            onClick={() => setMenuOpen(!menuOpen)}
            className="nav-mobile"
            style={{
              background: "none",
              border: "none",
              cursor: "pointer",
              padding: 8,
              color: "var(--lp-text-primary)",
            }}
            aria-label="Toggle menu"
          >
            {menuOpen ? (
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            ) : (
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                <line x1="4" y1="8" x2="20" y2="8" /><line x1="4" y1="16" x2="20" y2="16" />
              </svg>
            )}
          </button>
        </div>
      </nav>

      {/* Mobile Menu Overlay */}
      {menuOpen && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 199,
            background: "var(--lp-bg-base)",
            display: "flex",
            flexDirection: "column",
            padding: "96px 24px 32px",
            gap: 8,
          }}
        >
          {NAV_LINKS.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              onClick={() => setMenuOpen(false)}
              style={{
                fontFamily: "var(--font-unbounded)",
                fontSize: 24,
                fontWeight: 700,
                color: "var(--lp-text-primary)",
                textDecoration: "none",
                padding: "16px 0",
                borderBottom: "1px solid rgba(255,255,255,0.05)",
              }}
            >
              {link.label}
            </Link>
          ))}
          <div style={{ marginTop: 32, display: "flex", flexDirection: "column", gap: 12 }}>
            {user ? (
              <NavAccountButton user={user} onClick={() => setMenuOpen(false)} />
            ) : (
              <>
            <Link
              href="/login"
              onClick={() => setMenuOpen(false)}
              style={{
                fontFamily: "var(--font-jetbrains-mono)",
                fontSize: 14,
                fontWeight: 500,
                color: "var(--lp-text-secondary)",
                textDecoration: "none",
                textAlign: "center",
                padding: "14px",
                border: "1px solid rgba(255,255,255,0.1)",
                borderRadius: 999,
              }}
            >
              Masuk
            </Link>
            <Link
              href="/signup"
              onClick={() => setMenuOpen(false)}
              style={{
                fontFamily: "var(--font-jetbrains-mono)",
                fontSize: 14,
                fontWeight: 700,
                background: "var(--lp-text-primary)",
                color: "var(--lp-bg-base)",
                textDecoration: "none",
                textAlign: "center",
                padding: "14px",
                borderRadius: 999,
              }}
            >
              Isi brief gratis
            </Link>
              </>
            )}
          </div>
        </div>
      )}

      <style>{`
        @media (max-width: 768px) {
          .nav-desktop { display: none !important; }
          .nav-mobile { display: flex !important; }
        }
        @media (min-width: 769px) {
          .nav-desktop { display: flex !important; }
          .nav-mobile { display: none !important; }
        }
      `}</style>
    </>
  );
}
