import { Button, Drawer, Dropdown, type Key } from "@heroui/react";
import {
  ArrowLeftRight,
  Armchair,
  Calculator,
  CalendarClock,
  Hammer,
  Layers,
  LayoutDashboard,
  Menu,
  Moon,
  Package,
  Plus,
  Recycle,
  Search,
  Settings,
  SquareKanban,
  Wallet,
  Ship,
  ShoppingCart,
  Sun,
  Users,
  type LucideIcon,
} from "lucide-react";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { NavLink, Outlet, useLocation, useNavigate } from "react-router";
import { EPS, isOpenWo, outstandingCheckouts, receivables, today } from "@/domain";
import { CommandPalette } from "./CommandPalette";
import { useDb, useDbStore } from "@/store/db-store";
import { useTheme } from "@/lib/theme";
import { BRAND } from "@/brand/brand";
import { Wordmark } from "@/brand/Logo";

interface NavItem {
  to: string;
  label: string;
  icon: LucideIcon;
  end?: boolean;
  badge?: (counts: NavCounts) => { value: number; tone: "accent" | "danger" } | undefined;
}

interface NavCounts {
  woOpen: number;
  rentalLate: number;
  purchasesWaiting: number;
  remnants: number;
  arOverdue: number;
}

const NAV: { title?: string; items: NavItem[] }[] = [
  { items: [{ to: "/", label: "Beranda", icon: LayoutDashboard, end: true }] },
  {
    title: "Operasional",
    items: [
      { to: "/produksi", label: "Perintah kerja", icon: Hammer, end: true, badge: (c) => (c.woOpen ? { value: c.woOpen, tone: "accent" } : undefined) },
      { to: "/produksi/papan", label: "Papan produksi", icon: SquareKanban },
      {
        to: "/pembelian",
        label: "Pembelian",
        icon: ShoppingCart,
        badge: (c) => (c.purchasesWaiting ? { value: c.purchasesWaiting, tone: "accent" } : undefined),
      },
      { to: "/penjualan", label: "Penjualan & Ekspor", icon: Ship },
      { to: "/sewa", label: "Sewa & Pinjam", icon: CalendarClock, badge: (c) => (c.rentalLate ? { value: c.rentalLate, tone: "danger" } : undefined) },
      { to: "/keuangan", label: "Piutang & Utang", icon: Wallet, badge: (c) => (c.arOverdue ? { value: c.arOverdue, tone: "danger" } : undefined) },
    ],
  },
  {
    title: "Gudang",
    items: [
      { to: "/stok/material", label: "Stok Material", icon: Layers },
      { to: "/stok/sisa", label: "Sisa Material", icon: Recycle, badge: (c) => (c.remnants ? { value: c.remnants, tone: "accent" } : undefined) },
      { to: "/stok/produk", label: "Stok Produk", icon: Armchair },
      { to: "/stok/mutasi", label: "Mutasi Stok", icon: ArrowLeftRight },
    ],
  },
  { title: "Analisa", items: [{ to: "/laporan", label: "Laporan HPP", icon: Calculator }] },
  {
    title: "Data Master",
    items: [
      { to: "/master/item", label: "Produk & Material", icon: Package },
      { to: "/master/relasi", label: "Pelanggan & Pemasok", icon: Users },
      { to: "/pengaturan", label: "Pengaturan", icon: Settings },
    ],
  },
];

const QUICK_ACTIONS = [
  { id: "/produksi/baru", label: "Perintah kerja", hint: "Produksi · konversi · bongkar" },
  { id: "/pembelian/baru", label: "Pembelian", hint: "Catat & terima barang" },
  { id: "/penjualan/baru", label: "Order penjualan", hint: "Supply atau ekspor" },
  { id: "/sewa/baru", label: "Sewa / pinjam", hint: "Booking unit" },
];

function useNavCounts(): NavCounts {
  const db = useDb();
  return useMemo(() => {
    const t = today();
    return {
      woOpen: db.workOrders.filter(isOpenWo).length,
      rentalLate: db.rentals.filter((r) => r.status === "berjalan" && r.endDate < t && outstandingCheckouts(r).length > 0).length,
      purchasesWaiting: db.purchases.filter((p) => p.status === "draft").length,
      remnants: db.lots.filter((l) => l.isRemnant && l.status === "tersedia" && l.qty > EPS).length,
      arOverdue: receivables(db, t).filter((r) => r.overdueDays > 0).length,
    };
  }, [db]);
}

function Brand() {
  const name = useDb().settings.companyName;
  return (
    <NavLink to="/" className="block min-w-0 rounded-sm px-3 py-1 leading-tight focus-visible:ring-2 focus-visible:ring-focus focus-visible:outline-none" aria-label={`${BRAND.name} — beranda`}>
      <Wordmark />
      <p className="mt-1 truncate pl-[30px] text-xs text-muted">{name}</p>
    </NavLink>
  );
}

function NavList({ onNavigate }: { onNavigate?: () => void }) {
  const counts = useNavCounts();
  return (
    <nav aria-label="Navigasi utama" className="flex flex-col gap-4">
      {NAV.map((group, gi) => (
        <div key={gi}>
          {group.title && <p className="eyebrow mb-1 px-3">{group.title}</p>}
          <ul className="flex flex-col gap-0.5">
            {group.items.map((item) => {
              const badge = item.badge?.(counts);
              return (
                <li key={item.to}>
                  <NavLink
                    to={item.to}
                    end={item.end}
                    onClick={onNavigate}
                    className={({ isActive }) =>
                      `relative flex items-center gap-2.5 rounded-sm px-3 py-1.5 text-[13px] transition-colors ${
                        isActive
                          ? "bg-default font-medium text-foreground before:absolute before:inset-y-1 before:left-0 before:w-0.5 before:rounded-full before:bg-accent"
                          : "text-foreground/75 hover:bg-default/60 hover:text-foreground"
                      }`
                    }
                  >
                    <item.icon className="size-4 shrink-0 opacity-70" strokeWidth={1.75} />
                    <span className="flex-1 truncate">{item.label}</span>
                    {badge && (
                      <span
                        className={`num min-w-5 text-right text-[11px] ${badge.tone === "danger" ? "font-semibold text-danger" : "text-muted"}`}
                      >
                        {badge.value}
                      </span>
                    )}
                  </NavLink>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </nav>
  );
}

function QuickCreate({ compact }: { compact?: boolean }) {
  const navigate = useNavigate();
  return (
    <Dropdown>
      <Button variant="primary" size="sm" isIconOnly={compact} aria-label="Buat baru">
        <Plus className="size-4" />
        {!compact && "Buat"}
      </Button>
      <Dropdown.Popover placement="bottom end">
        <Dropdown.Menu aria-label="Buat baru" onAction={(key: Key) => navigate(String(key))}>
          {QUICK_ACTIONS.map((a) => (
            <Dropdown.Item key={a.id} id={a.id} textValue={a.label}>
              <div className="flex flex-col">
                <span className="text-sm font-medium">{a.label}</span>
                <span className="text-xs text-muted">{a.hint}</span>
              </div>
            </Dropdown.Item>
          ))}
        </Dropdown.Menu>
      </Dropdown.Popover>
    </Dropdown>
  );
}

function ThemeToggle() {
  const { theme, toggle } = useTheme();
  return (
    <Button isIconOnly variant="ghost" size="sm" aria-label="Ganti tema" onPress={toggle}>
      {theme === "dark" ? <Sun className="size-4" /> : <Moon className="size-4" />}
    </Button>
  );
}

function DemoBanner() {
  const isDemo = useDbStore((s) => s.isDemo);
  const navigate = useNavigate();
  if (!isDemo) return null;
  return (
    <div className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1 border-b border-[var(--rule)] px-4 py-1.5 text-center text-xs text-muted">
      <span>Data demo — tersimpan hanya di perangkat ini.</span>
      <button type="button" className="font-semibold underline underline-offset-2" onClick={() => navigate("/pengaturan")}>
        Mulai dengan data kosong
      </button>
    </div>
  );
}

function SearchButton({ onPress }: { onPress: () => void }) {
  const mac = typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform);
  return (
    <button
      type="button"
      onClick={onPress}
      className="flex h-8 w-full max-w-sm items-center gap-2 rounded-sm border border-[var(--rule)] bg-surface px-2.5 text-[13px] text-muted transition-colors hover:border-[var(--ink-soft)] focus-visible:ring-2 focus-visible:ring-focus focus-visible:outline-none"
    >
      <Search className="size-3.5" />
      <span className="flex-1 truncate text-left">Cari kode, barang, klien…</span>
      <kbd className="num hidden text-[11px] sm:inline">{mac ? "⌘K" : "Ctrl K"}</kbd>
    </button>
  );
}

export function AppShell({ children }: { children?: ReactNode }) {
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const location = useLocation();

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setPaletteOpen((o) => !o);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    window.scrollTo({ top: 0 });
  }, [location.pathname]);

  return (
    <div className="min-h-dvh bg-background text-foreground">
      <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-50 focus:rounded-lg focus:bg-surface focus:px-3 focus:py-2">
        Lewati ke konten
      </a>
      <aside className="fixed inset-y-0 left-0 hidden w-64 flex-col border-r border-[var(--rule)] bg-surface lg:flex print:hidden">
        <div className="flex h-16 items-center px-2">
          <Brand />
        </div>
        <div className="flex-1 overflow-y-auto px-3 pt-2 pb-6">
          <NavList />
        </div>
        <div className="border-t border-[var(--rule)] px-5 py-3 text-[11px] text-muted">
          {BRAND.name} {BRAND.version} · {BRAND.line}
        </div>
      </aside>

      <div className="lg:pl-64">
        <div className="print:hidden">
          <DemoBanner />
        </div>
        <header className="sticky top-0 z-30 flex h-14 items-center gap-2 border-b border-[var(--rule)] bg-background/90 px-4 backdrop-blur lg:px-8 print:hidden">
          <Button isIconOnly variant="ghost" size="sm" aria-label="Buka menu" className="lg:hidden" onPress={() => setDrawerOpen(true)}>
            <Menu className="size-5" />
          </Button>
          <div className="flex-1">
            <SearchButton onPress={() => setPaletteOpen(true)} />
          </div>
          <ThemeToggle />
          <QuickCreate />
        </header>
        <main id="main" className="mx-auto w-full max-w-7xl px-4 py-5 lg:px-8 lg:py-6 print:max-w-none print:p-0">
          {children ?? <Outlet />}
        </main>
      </div>

      <Drawer.Backdrop isOpen={drawerOpen} onOpenChange={setDrawerOpen}>
          <Drawer.Content placement="left" className="w-72 max-w-[85vw]">
            <Drawer.Dialog aria-label="Menu">
              <Drawer.Header>
                <Brand />
              </Drawer.Header>
              <Drawer.Body className="pb-6">
                <NavList onNavigate={() => setDrawerOpen(false)} />
              </Drawer.Body>
            </Drawer.Dialog>
          </Drawer.Content>
      </Drawer.Backdrop>
      <CommandPalette isOpen={paletteOpen} onOpenChange={setPaletteOpen} />
    </div>
  );
}
