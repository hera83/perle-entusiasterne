import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { AuthProvider } from "@/contexts/AuthContext";
import { ThemeProvider } from "@/contexts/ThemeContext";
import Gallery from "./pages/Gallery";
import Login from "./pages/Login";
import Favorites from "./pages/Favorites";
import Administration from "./pages/Administration";
import Workshop from "./pages/Workshop";
import NotFound from "./pages/NotFound";
import SharedPattern from "./pages/SharedPattern";

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: 1 } },
});

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <AuthProvider>
        <ThemeProvider>
          <Toaster />
          <Sonner />
          <BrowserRouter>
            <Routes>
              <Route path="/" element={<Gallery />} />
              <Route path="/login" element={<Login />} />
              <Route path="/favoritter" element={<Favorites />} />
              <Route path="/administration" element={<Administration />} />
              <Route path="/workshop" element={<Workshop />} />
              <Route path="/workshop/:patternId" element={<Workshop />} />
              {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
              <Route path="*" element={<NotFound />} />
            </Routes>
          </BrowserRouter>
        </ThemeProvider>
      </AuthProvider>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
