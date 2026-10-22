import { I18nProvider, RouterProvider as AriaRouterProvider, Spinner, Toast } from "@heroui/react";
import { Suspense, type ComponentType } from "react";
import { createHashRouter, isRouteErrorResponse, Outlet, RouterProvider, useHref, useNavigate, useRouteError } from "react-router";
import { AppShell } from "./components/AppShell";
import { BrandedState } from "./components/BrandedState";
import { WelcomePage } from "./features/welcome/WelcomePage";
import { useDbStore } from "./store/db-store";

type PageModule = { default: ComponentType };
const page = (load: () => Promise<PageModule>) => async () => ({ Component: (await load()).default });

function Root() {
  const navigate = useNavigate();
  const onboarded = useDbStore((s) => s.onboarded);
  return (
    <AriaRouterProvider navigate={navigate} useHref={useHref}>
      {!onboarded ? (
        <WelcomePage />
      ) : (
        <AppShell>
          <Suspense fallback={<PageLoading />}>
            <Outlet />
          </Suspense>
        </AppShell>
      )}
    </AriaRouterProvider>
  );
}

function PageLoading() {
  return (
    <div className="grid min-h-[40vh] place-items-center">
      <Spinner size="lg" />
    </div>
  );
}

function RouteError() {
  const error = useRouteError();
  const notFound = isRouteErrorResponse(error) && error.status === 404;
  return (
    <AppShell>
      <BrandedState
        code={notFound ? "404" : "Galat"}
        title={notFound ? "Halaman ini tidak ada di buku kerja." : "Ada yang patah saat halaman ini dibuka."}
        body={notFound ? "Tautannya mungkin salah ketik, atau datanya sudah dihapus." : error instanceof Error ? error.message : String(error)}
      />
    </AppShell>
  );
}

const router = createHashRouter([
  {
    element: <Root />,
    errorElement: <RouteError />,
    hydrateFallbackElement: <PageLoading />,
    children: [
      { index: true, lazy: page(() => import("./features/dashboard/DashboardPage")) },
      { path: "produksi", lazy: page(() => import("./features/production/WorkOrdersPage")) },
      { path: "produksi/baru", lazy: page(() => import("./features/production/WorkOrderNewPage")) },
      { path: "produksi/papan", lazy: page(() => import("./features/production/BoardPage")) },
      { path: "produksi/:id", lazy: page(() => import("./features/production/WorkOrderDetailPage")) },
      { path: "pembelian", lazy: page(() => import("./features/purchasing/PurchasesPage")) },
      { path: "pembelian/baru", lazy: page(() => import("./features/purchasing/PurchaseFormPage")) },
      { path: "pembelian/:id", lazy: page(() => import("./features/purchasing/PurchaseDetailPage")) },
      { path: "pembelian/:id/ubah", lazy: page(() => import("./features/purchasing/PurchaseFormPage")) },
      { path: "penjualan", lazy: page(() => import("./features/sales/SalesPage")) },
      { path: "penjualan/baru", lazy: page(() => import("./features/sales/SalesFormPage")) },
      { path: "penjualan/:id", lazy: page(() => import("./features/sales/SalesDetailPage")) },
      { path: "penjualan/:id/ubah", lazy: page(() => import("./features/sales/SalesFormPage")) },
      { path: "penjualan/:id/dokumen", lazy: page(() => import("./features/sales/ExportDocsPage")) },
      { path: "sewa", lazy: page(() => import("./features/rentals/RentalsPage")) },
      { path: "sewa/baru", lazy: page(() => import("./features/rentals/RentalFormPage")) },
      { path: "sewa/:id", lazy: page(() => import("./features/rentals/RentalDetailPage")) },
      { path: "sewa/:id/ubah", lazy: page(() => import("./features/rentals/RentalFormPage")) },
      { path: "keuangan", lazy: page(() => import("./features/finance/FinancePage")) },
      { path: "stok/material", lazy: page(() => import("./features/inventory/MaterialStockPage")) },
      { path: "stok/sisa", lazy: page(() => import("./features/inventory/RemnantsPage")) },
      { path: "stok/produk", lazy: page(() => import("./features/inventory/ProductStockPage")) },
      { path: "stok/mutasi", lazy: page(() => import("./features/inventory/MovesPage")) },
      { path: "stok/item/:id", lazy: page(() => import("./features/inventory/ItemStockPage")) },
      { path: "laporan", lazy: page(() => import("./features/reports/HppReportPage")) },
      { path: "master/item", lazy: page(() => import("./features/master/ItemsPage")) },
      { path: "master/item/baru", lazy: page(() => import("./features/master/ItemFormPage")) },
      { path: "master/item/:id", lazy: page(() => import("./features/master/ItemFormPage")) },
      { path: "master/relasi", lazy: page(() => import("./features/master/PartnersPage")) },
      { path: "pengaturan", lazy: page(() => import("./features/settings/SettingsPage")) },
      { path: "*", lazy: page(() => import("./features/NotFoundPage")) },
    ],
  },
]);

export function App() {
  return (
    <I18nProvider locale="id-ID">
      <Toast.Provider placement="bottom end" />
      <RouterProvider router={router} />
    </I18nProvider>
  );
}
