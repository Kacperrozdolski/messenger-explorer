import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Outlet, useLocation } from "react-router-dom";
import { Toaster } from "sonner";
import Index from "./pages/Index";
import Settings from "./pages/Settings";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

/**
 * Layout keeps Index always mounted so navigating to/from Settings
 * doesn't destroy and recreate the entire gallery + sidebar tree.
 */
const PersistentLayout = () => {
  const location = useLocation();
  const onSettings = location.pathname === "/settings";

  return (
    <>
      <div className={onSettings ? "hidden" : undefined}>
        <Index />
      </div>
      <Outlet />
    </>
  );
};

const App = () => (
  <QueryClientProvider client={queryClient}>
    <BrowserRouter>
      <Routes>
        <Route element={<PersistentLayout />}>
          <Route index element={null} />
          <Route path="settings" element={<Settings />} />
        </Route>
        <Route path="*" element={<NotFound />} />
      </Routes>
    </BrowserRouter>
    <Toaster position="bottom-right" richColors />
  </QueryClientProvider>
);

export default App;
