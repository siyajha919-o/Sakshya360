import React from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import 'leaflet/dist/leaflet.css';
import './styles.css';
import { getSession, MONITOR_ROLES } from './api';
import Layout from './components/Layout';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import ProjectDetail from './pages/ProjectDetail';
import Cctv from './pages/Cctv';
import VideoCall from './pages/VideoCall';
import Assignments from './pages/Assignments';
import Reports from './pages/Reports';
import Analytics from './pages/Analytics';
import Grievances from './pages/Grievances';
import PublicFeedback from './pages/PublicFeedback';

function Protected({ children }) {
  const s = getSession();
  if (!s) return <Navigate to="/login" replace />;
  if (!MONITOR_ROLES.includes(s.user.role)) {
    return <div className="center-note">This dashboard is for DoSJE, State and District officials. Inspectors, NGOs and beneficiaries use the Sakshya360 mobile app.</div>;
  }
  return children;
}

createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/feedback/:projectId" element={<PublicFeedback />} />
        <Route element={<Protected><Layout /></Protected>}>
          <Route index element={<Dashboard />} />
          <Route path="projects/:id" element={<ProjectDetail />} />
          <Route path="cctv" element={<Cctv />} />
          <Route path="vc" element={<VideoCall />} />
          <Route path="assignments" element={<Assignments />} />
          <Route path="reports" element={<Reports />} />
          <Route path="analytics" element={<Analytics />} />
          <Route path="grievances" element={<Grievances />} />
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  </React.StrictMode>,
);
