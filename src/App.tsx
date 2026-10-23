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
        code={notFound ? "404" : "Error"}
        title={notFound ? "This page is not in the workbook." : "Something broke while opening this page."}
        body={notFound ? "The link may have a typo, or the record has been deleted." : error instanceof Error ? error.message : String(error)}
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
      { path: "work-orders", lazy: page(() => import("./features/production/WorkOrdersPage")) },
      { path: "work-orders/new", lazy: page(() => import("./features/production/WorkOrderNewPage")) },
      { path: "board", lazy: page(() => import("./features/production/BoardPage")) },
      { path: "work-orders/:id", lazy: page(() => import("./features/production/WorkOrderDetailPage")) },
      { path: "purchases", lazy: page(() => import("./features/purchasing/PurchasesPage")) },
      { path: "purchases/new", lazy: page(() => import("./features/purchasing/PurchaseFormPage")) },
      { path: "purchases/:id", lazy: page(() => import("./features/purchasing/PurchaseDetailPage")) },
      { path: "purchases/:id/edit", lazy: page(() => import("./features/purchasing/PurchaseFormPage")) },
      { path: "sales", lazy: page(() => import("./features/sales/SalesPage")) },
      { path: "sales/new", lazy: page(() => import("./features/sales/SalesFormPage")) },
      { path: "sales/:id", lazy: page(() => import("./features/sales/SalesDetailPage")) },
      { path: "sales/:id/edit", lazy: page(() => import("./features/sales/SalesFormPage")) },
      { path: "sales/:id/documents", lazy: page(() => import("./features/sales/ExportDocsPage")) },
      { path: "rentals", lazy: page(() => import("./features/rentals/RentalsPage")) },
      { path: "rentals/new", lazy: page(() => import("./features/rentals/RentalFormPage")) },
      { path: "rentals/:id", lazy: page(() => import("./features/rentals/RentalDetailPage")) },
      { path: "rentals/:id/edit", lazy: page(() => import("./features/rentals/RentalFormPage")) },
      { path: "finance", lazy: page(() => import("./features/finance/FinancePage")) },
      { path: "stock/materials", lazy: page(() => import("./features/inventory/MaterialStockPage")) },
      { path: "stock/offcuts", lazy: page(() => import("./features/inventory/RemnantsPage")) },
      { path: "stock/products", lazy: page(() => import("./features/inventory/ProductStockPage")) },
      { path: "stock/movements", lazy: page(() => import("./features/inventory/MovesPage")) },
      { path: "stock/items/:id", lazy: page(() => import("./features/inventory/ItemStockPage")) },
      { path: "stock/lots/:id", lazy: page(() => import("./features/inventory/LotTracePage")) },
      { path: "recipes", lazy: page(() => import("./features/recipes/RecipesPage")) },
      { path: "recipes/new", lazy: page(() => import("./features/recipes/RecipeFormPage")) },
      { path: "recipes/:id", lazy: page(() => import("./features/recipes/RecipeDetailPage")) },
      { path: "recipes/:id/edit", lazy: page(() => import("./features/recipes/RecipeFormPage")) },
      { path: "flow-map", lazy: page(() => import("./features/map/PlantMapPage")) },
      { path: "routes", lazy: page(() => import("./features/routes/RouteMapPage")) },
      { path: "routes/:id", lazy: page(() => import("./features/routes/RouteMapPage")) },
      { path: "reports", lazy: page(() => import("./features/reports/HppReportPage")) },
      { path: "items", lazy: page(() => import("./features/master/ItemsPage")) },
      { path: "items/new", lazy: page(() => import("./features/master/ItemFormPage")) },
      { path: "items/:id", lazy: page(() => import("./features/master/ItemFormPage")) },
      { path: "contacts", lazy: page(() => import("./features/master/PartnersPage")) },
      { path: "help", lazy: page(() => import("./help/HelpPage")) },
      { path: "settings", lazy: page(() => import("./features/settings/SettingsPage")) },
      { path: "*", lazy: page(() => import("./features/NotFoundPage")) },
    ],
  },
]);

export function App() {
  return (
    <I18nProvider locale="en-GB">
      <Toast.Provider placement="bottom end" />
      <RouterProvider router={router} />
    </I18nProvider>
  );
}
