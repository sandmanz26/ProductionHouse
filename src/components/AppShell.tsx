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
  Settings,
  Ship,
  ShoppingCart,
  Sun,
  Users,
  type LucideIcon,
} from "lucide-react";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { NavLink, Outlet, useLocation, useNavigate } from "react-router";
import { EPS, isOpenWo, outstandingCheckouts, today } from "@/domain";
import { useDb, useDbStore } from "@/store/db-store";
import { useTheme } from "@/lib/theme";

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
}

const NAV: { title?: string; items: NavItem[] }[] = [
  { items: [{ to: "/", label: "Beranda", icon: LayoutDashboard, end: true }] },
  {
    title: "Operasional",
    items: [
      { to: "/produksi", label: "Produksi", icon: Hammer, badge: (c) => (c.woOpen ? { value: c.woOpen, tone: "accent" } : undefined) },
      {
        to: "/pembelian",
        label: "Pembelian",
        icon: ShoppingCart,
        badge: (c) => (c.purchasesWaiting ? { value: c.purchasesWaiting, tone: "accent" } : undefined),
      },
      { to: "/penjualan", label: "Penjualan & Ekspor", icon: Ship },
      { to: "/sewa", label: "Sewa & Pinjam", icon: CalendarClock, badge: (c) => (c.rentalLate ? { value: c.rentalLate, tone: "danger" } : undefined) },
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
    };
  }, [db]);
}

function Brand() {
  const name = useDb().settings.companyName;
  return (
    <div className="flex items-center gap-2.5 px-3 py-1">
      <div className="grid size-9 place-items-center rounded-xl bg-accent text-accent-foreground shadow-sm">
        <Armchair className="size-5" />
      </div>
      <div className="min-w-0 leading-tight">
        <p className="font-semibold tracking-tight">MebelOS</p>
        <p className="truncate text-xs text-muted">{name}</p>
      </div>
    </div>
  );
}

function NavList({ onNavigate }: { onNavigate?: () => void }) {
  const counts = useNavCounts();
  return (
    <nav aria-label="Navigasi utama" className="flex flex-col gap-5">
      {NAV.map((group, gi) => (
        <div key={gi}>
          {group.title && <p className="mb-1 px-3 text-[11px] font-semibold tracking-wider text-muted uppercase">{group.title}</p>}
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
                      `flex items-center gap-3 rounded-xl px-3 py-2 text-sm transition-colors ${
                        isActive
                          ? "bg-accent-soft font-medium text-accent-soft-foreground"
                          : "text-foreground/80 hover:bg-default hover:text-foreground"
                      }`
                    }
                  >
                    <item.icon className="size-4 shrink-0" />
                    <span className="flex-1 truncate">{item.label}</span>
                    {badge && (
                      <span
                        className={`min-w-5 rounded-full px-1.5 text-center text-[11px] leading-5 font-semibold ${
                          badge.tone === "danger" ? "bg-danger text-danger-foreground" : "bg-default text-default-foreground"
                        }`}
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
    <div className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1 bg-accent-soft px-4 py-2 text-center text-xs text-accent-soft-foreground">
      <span>Anda sedang melihat <b>data demo</b>. Semua data tersimpan di perangkat ini.</span>
      <button type="button" className="font-semibold underline underline-offset-2" onClick={() => navigate("/pengaturan")}>
        Mulai dengan data kosong
      </button>
    </div>
  );
}

export function AppShell({ children }: { children?: ReactNode }) {
  const [drawerOpen, setDrawerOpen] = useState(false);
  const location = useLocation();

  useEffect(() => {
    window.scrollTo({ top: 0 });
  }, [location.pathname]);

  return (
    <div className="min-h-dvh bg-background text-foreground">
      <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-50 focus:rounded-lg focus:bg-surface focus:px-3 focus:py-2">
        Lewati ke konten
      </a>
      <aside className="fixed inset-y-0 left-0 hidden w-64 flex-col border-r border-separator bg-surface lg:flex print:hidden">
        <div className="flex h-16 items-center px-2">
          <Brand />
        </div>
        <div className="flex-1 overflow-y-auto px-3 pt-2 pb-6">
          <NavList />
        </div>
        <div className="border-t border-separator px-5 py-3 text-[11px] text-muted">
          MebelOS v1.0 · data tersimpan di perangkat ini
        </div>
      </aside>

      <div className="lg:pl-64">
        <div className="print:hidden">
          <DemoBanner />
        </div>
        <header className="sticky top-0 z-30 flex h-14 items-center gap-2 border-b border-separator bg-background/85 px-4 backdrop-blur lg:px-8 print:hidden">
          <Button isIconOnly variant="ghost" size="sm" aria-label="Buka menu" className="lg:hidden" onPress={() => setDrawerOpen(true)}>
            <Menu className="size-5" />
          </Button>
          <div className="lg:hidden">
            <p className="font-semibold tracking-tight">MebelOS</p>
          </div>
          <div className="flex-1" />
          <ThemeToggle />
          <QuickCreate />
        </header>
        <main id="main" className="mx-auto w-full max-w-7xl px-4 py-6 lg:px-8 lg:py-8 print:max-w-none print:p-0">
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
    </div>
  );
}
