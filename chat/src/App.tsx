import { Routes, Route } from "react-router-dom";
import Landing from "./pages/Landing";
import Home from "./pages/Home";
import Chat from "./pages/Chat";

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Landing />} />
      <Route path="/agents" element={<Home />} />
      <Route path="/agents/:slug" element={<Chat />} />
    </Routes>
  );
}
