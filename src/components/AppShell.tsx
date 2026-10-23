import { Button, Drawer, Dropdown, type Key } from "@heroui/react";
import {
  ArrowLeftRight,
  Armchair,
  BookOpen,
  GitFork,
  Calculator,
  CircleHelp,
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
  Workflow,
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
import { useHelp } from "@/help/help-store";
import { FirstVisitTip, PageHelpButton, PageHelpPanel } from "@/help/PageHelp";
import { Tour } from "@/help/Tour";

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
  { items: [{ to: "/", label: "Home", icon: LayoutDashboard, end: true }] },
  {
    title: "Operations",
    items: [
      { to: "/work-orders", label: "Work orders", icon: Hammer, end: true, badge: (c) => (c.woOpen ? { value: c.woOpen, tone: "accent" } : undefined) },
      { to: "/board", label: "Production board", icon: SquareKanban },
      { to: "/recipes", label: "Recipes", icon: BookOpen },
      { to: "/routes", label: "Production routes", icon: GitFork },
      {
        to: "/purchases",
        label: "Purchasing",
        icon: ShoppingCart,
        badge: (c) => (c.purchasesWaiting ? { value: c.purchasesWaiting, tone: "accent" } : undefined),
      },
      { to: "/sales", label: "Sales & export", icon: Ship },
      { to: "/rentals", label: "Rental & loan", icon: CalendarClock, badge: (c) => (c.rentalLate ? { value: c.rentalLate, tone: "danger" } : undefined) },
      { to: "/finance", label: "Receivables & payables", icon: Wallet, badge: (c) => (c.arOverdue ? { value: c.arOverdue, tone: "danger" } : undefined) },
    ],
  },
  {
    title: "Stock",
    items: [
      { to: "/stock/materials", label: "Materials", icon: Layers },
      { to: "/stock/offcuts", label: "Offcuts", icon: Recycle, badge: (c) => (c.remnants ? { value: c.remnants, tone: "accent" } : undefined) },
      { to: "/stock/products", label: "Products", icon: Armchair },
      { to: "/stock/movements", label: "Stock movements", icon: ArrowLeftRight },
    ],
  },
  {
    title: "Analysis",
    items: [
      { to: "/flow-map", label: "Flow map", icon: Workflow },
      { to: "/reports", label: "Cost report", icon: Calculator },
    ],
  },
  {
    title: "Master data",
    items: [
      { to: "/items", label: "Products & materials", icon: Package },
      { to: "/contacts", label: "Customers & suppliers", icon: Users },
      { to: "/settings", label: "Settings", icon: Settings },
    ],
  },
  { items: [{ to: "/help", label: "Help & guide", icon: CircleHelp }] },
];

const QUICK_ACTIONS = [
  { id: "/work-orders/new", label: "Work order", hint: "Production · conversion · dismantling" },
  { id: "/purchases/new", label: "Purchase order", hint: "Record & receive goods" },
  { id: "/sales/new", label: "Sales order", hint: "Supply or export" },
  { id: "/rentals/new", label: "Rental / loan", hint: "Book units" },
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
    <NavLink to="/" className="block min-w-0 rounded-sm px-3 py-1 leading-tight focus-visible:ring-2 focus-visible:ring-focus focus-visible:outline-none" aria-label={`${BRAND.name} — home`}>
      <Wordmark />
      <p className="mt-1 truncate pl-[30px] text-xs text-muted">{name}</p>
    </NavLink>
  );
}

function NavList({ onNavigate }: { onNavigate?: () => void }) {
  const counts = useNavCounts();
  return (
    <nav aria-label="Main navigation" className="flex flex-col gap-4">
      {NAV.map((group, gi) => (
        <div key={gi}>
          {group.title && <p className="caption-label mb-1 px-3">{group.title}</p>}
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
                          ? "bg-default font-medium text-foreground"
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
      <Button variant="primary" size="sm" isIconOnly={compact} aria-label="Create new">
        <Plus className="size-4" />
        {!compact && <span className="hidden sm:inline">New</span>}
      </Button>
      <Dropdown.Popover placement="bottom end">
        <Dropdown.Menu aria-label="Create new" onAction={(key: Key) => navigate(String(key))}>
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
    <Button isIconOnly variant="ghost" size="sm" aria-label="Switch theme" onPress={toggle}>
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
      <span>Demo data — saved on this device only.</span>
      <button type="button" className="font-semibold underline underline-offset-2" onClick={() => navigate("/settings")}>
        Start with empty data
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
      <span className="flex-1 truncate text-left">Search codes, items, clients…</span>
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

  // First visit: introduce the workshop once; it can be replayed from Help.
  const tourDone = useHelp((s) => s.tourDone);
  const openTour = useHelp((s) => s.openTour);
  useEffect(() => {
    if (!tourDone) openTour();
  }, [tourDone, openTour]);

  useEffect(() => {
    window.scrollTo({ top: 0 });
  }, [location.pathname]);

  return (
    <div className="min-h-dvh bg-background text-foreground">
      <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-50 focus:rounded-lg focus:bg-surface focus:px-3 focus:py-2">
        Skip to content
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
        <header className="sticky top-0 z-30 flex h-14 items-center gap-2 border-b border-[var(--rule)] bg-background px-4 lg:px-8 print:hidden">
          <Button isIconOnly variant="ghost" size="sm" aria-label="Open menu" className="lg:hidden" onPress={() => setDrawerOpen(true)}>
            <Menu className="size-5" />
          </Button>
          <div className="min-w-0 flex-1">
            <SearchButton onPress={() => setPaletteOpen(true)} />
          </div>
          <PageHelpButton />
          <ThemeToggle />
          <QuickCreate />
        </header>
        <main id="main" className="mx-auto w-full max-w-7xl px-4 py-5 lg:px-8 lg:py-6 print:max-w-none print:p-0">
          <FirstVisitTip />
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
      <PageHelpPanel />
      <Tour />
      <CommandPalette isOpen={paletteOpen} onOpenChange={setPaletteOpen} />
    </div>
  );
}
