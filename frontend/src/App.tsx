import { Navigate, Route, Routes, useLocation } from "react-router-dom";

import { useAuth } from "@/context/auth-context";
import DiscoveryPage from "@/pages/index";
import LoginPage from "@/pages/login";
import RegisterPage from "@/pages/register";
import ComposePage from "@/pages/compose";
import ProfilePage from "@/pages/profile";
import TopicPage from "@/pages/topic";
import SearchPage from "@/pages/search";
import MessagesPage from "@/pages/messages";
import SettingsPage from "@/pages/settings";
import PostDetailPage from "@/pages/post";
import CreatorCenterPage from "@/pages/creator-center";
import { TopNav } from "@/components/layout/top-nav";

function RequireAuth({ children }: { children: JSX.Element }) {
  const { user, loading } = useAuth();
  const location = useLocation();

  if (loading) {
    return <div className="mx-auto mt-20 w-full max-w-6xl text-center text-slate-500">加载中...</div>;
  }

  if (!user) {
    return <Navigate to="/login" state={{ from: location.pathname }} replace />;
  }

  return children;
}

export default function App() {
  return (
    <div className="min-h-screen">
      <TopNav />
      <Routes>
        <Route path="/" element={<DiscoveryPage />} />
        <Route path="/login" element={<LoginPage />} />
        <Route path="/register" element={<RegisterPage />} />
        <Route path="/search" element={<SearchPage />} />
        <Route path="/post/:id" element={<PostDetailPage />} />
        <Route
          path="/compose"
          element={
            <RequireAuth>
              <ComposePage />
            </RequireAuth>
          }
        />
        <Route
          path="/creator-center"
          element={
            <RequireAuth>
              <CreatorCenterPage />
            </RequireAuth>
          }
        />
        <Route
          path="/messages"
          element={
            <RequireAuth>
              <MessagesPage />
            </RequireAuth>
          }
        />
        <Route
          path="/settings"
          element={
            <RequireAuth>
              <SettingsPage />
            </RequireAuth>
          }
        />
        <Route path="/u/:id" element={<ProfilePage />} />
        <Route path="/topic/:topicId" element={<TopicPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </div>
  );
}
