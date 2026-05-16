import React, { useState, useEffect, useRef } from 'react';
import { BrowserRouter as Router, Routes, Route, useSearchParams } from 'react-router-dom';
import { MessageCircle, Send, X, ArrowLeft } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

// --- Visitor Components ---

const ChatWidget = () => {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<any[]>([]);
  const [input, setInput] = useState('');
  const [visitorId, setVisitorId] = useState('');
  const ws = useRef<WebSocket | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let vid = localStorage.getItem('visitor_id');
    if (!vid) {
      vid = 'v_' + Math.random().toString(36).substring(2, 11);
      localStorage.setItem('visitor_id', vid);
    }
    setVisitorId(vid);

    // Fetch history
    fetch(`/api/history?visitor_id=${vid}`)
      .then(res => res.json())
      .then(data => setMessages(data));

    // WebSocket connect
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const socket = new WebSocket(`${protocol}//${window.location.host}/ws?visitor_id=${vid}`);
    
    socket.onmessage = (event) => {
      const msg = JSON.parse(event.data);
      setMessages(prev => [...prev, msg]);
    };

    ws.current = socket;

    return () => socket.close();
  }, []);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, isOpen]);

  const sendMessage = () => {
    if (!input.trim() || !ws.current) return;
    ws.current.send(input);
    setMessages(prev => [...prev, { sender_type: 'visitor', content: input, created_at: new Date() }]);
    setInput('');
  };

  return (
    <>
      {/* Toggle Button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="fixed bottom-6 right-6 p-4 bg-indigo-600 text-white rounded-full shadow-lg hover:bg-indigo-700 transition-all z-50"
      >
        {isOpen ? <X size={28} /> : <MessageCircle size={28} />}
      </button>

      {/* Chat Window */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, y: 20, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 20, scale: 0.95 }}
            className="fixed bottom-24 right-6 w-80 sm:w-96 h-[500px] bg-white rounded-2xl shadow-2xl flex flex-col z-50 overflow-hidden border border-gray-100"
          >
            {/* Header */}
            <div className="p-4 bg-indigo-600 text-white font-medium flex items-center justify-between">
              <span>在线客服</span>
              <div className="flex items-center gap-2">
                <span className="w-2 h-2 bg-green-400 rounded-full animate-pulse"></span>
                <span className="text-xs text-indigo-100">为您服务中</span>
              </div>
            </div>

            {/* Messages */}
            <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-4 bg-gray-50">
              {messages.length === 0 && (
                <div className="text-center text-gray-400 text-sm mt-10">
                  您好！欢迎咨询，请在下方输入您的问题。
                </div>
              )}
              {messages.map((m, i) => (
                <div key={i} className={`flex ${m.sender_type === 'visitor' ? 'justify-end' : 'justify-start'}`}>
                  <div
                    className={`max-w-[80%] p-3 rounded-2xl text-sm ${
                      m.sender_type === 'visitor'
                        ? 'bg-indigo-600 text-white rounded-tr-none'
                        : 'bg-white text-gray-800 shadow-sm border border-gray-100 rounded-tl-none'
                    }`}
                  >
                    {m.content}
                  </div>
                </div>
              ))}
            </div>

            {/* Input */}
            <div className="p-4 border-t bg-white">
              <div className="flex gap-2">
                <input
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && sendMessage()}
                  placeholder="请输入咨询内容..."
                  className="flex-1 bg-gray-100 border-none rounded-xl px-4 py-2 text-sm focus:ring-2 focus:ring-indigo-500 transition-all"
                />
                <button
                  onClick={sendMessage}
                  className="p-2 bg-indigo-600 text-white rounded-xl hover:bg-indigo-700 transition-all"
                >
                  <Send size={20} />
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
};

// --- Agent Components ---

const AgentReplyView = () => {
  const [params] = useSearchParams();
  const sid = params.get('sid');
  const token = params.get('token');
  const [messages, setMessages] = useState<any[]>([]);
  const [input, setInput] = useState('');
  const [error, setError] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!sid || !token) {
      setError('无效的会话链接');
      return;
    }

    fetch(`/api/history?sid=${sid}&token=${token}`)
      .then(async res => {
        if (!res.ok) throw new Error('权限验证失败或链接已过期');
        return res.json();
      })
      .then(data => setMessages(data))
      .catch(err => setError(err.message));
  }, [sid, token]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const handleReply = async () => {
    if (!input.trim()) return;

    try {
      const res = await fetch('/api/agent/reply', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sid, token, content: input })
      });
      if (!res.ok) throw new Error('回复失败');
      
      setMessages(prev => [...prev, { sender_type: 'agent', content: input, created_at: new Date() }]);
      setInput('');
    } catch (err: any) {
      alert(err.message);
    }
  };

  if (error) {
    return (
      <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center p-6 text-center">
        <div className="bg-white p-8 rounded-3xl shadow-xl max-w-sm w-full">
          <div className="w-16 h-16 bg-red-100 text-red-600 rounded-full flex items-center justify-center mx-auto mb-4">
            <X size={32} />
          </div>
          <h2 className="text-xl font-bold text-gray-900 mb-2">链接失效</h2>
          <p className="text-gray-500 mb-6">{error}</p>
          <p className="text-sm text-gray-400">该回复链接可能已超过24小时有效期或对应的会话已关闭。</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-white flex flex-col h-screen overflow-hidden max-w-md mx-auto shadow-2xl">
      {/* Header */}
      <div className="p-4 border-b flex items-center gap-3 bg-white sticky top-0 z-10">
        <div className="w-10 h-10 bg-indigo-100 text-indigo-600 rounded-full flex items-center justify-center">
          <MessageCircle size={24} />
        </div>
        <div>
          <h2 className="font-bold text-gray-900">访客会话 #{sid}</h2>
          <p className="text-xs text-green-500 font-medium">正在回复访客咨询</p>
        </div>
      </div>

      {/* Messages */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-6 bg-gray-50">
        {messages.map((m, i) => (
          <div key={i} className={`flex flex-col ${m.sender_type === 'agent' ? 'items-end' : 'items-start'}`}>
            <div className={`max-w-[85%] p-4 rounded-2xl text-[15px] leading-relaxed ${
              m.sender_type === 'agent'
                ? 'bg-indigo-600 text-white rounded-tr-none'
                : 'bg-white text-gray-800 shadow-sm border border-gray-100 rounded-tl-none'
            }`}>
              {m.content}
            </div>
            <span className="text-[10px] text-gray-400 mt-1 px-1">
              {new Date(m.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
            </span>
          </div>
        ))}
      </div>

      {/* Input */}
      <div className="p-4 bg-white border-t safe-area-bottom">
        <div className="flex gap-2 bg-gray-100 rounded-2xl p-1 pr-2">
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleReply()}
            placeholder="输入回复内容..."
            className="flex-1 bg-transparent border-none px-4 py-3 text-[15px] focus:ring-0"
          />
          <button
            onClick={handleReply}
            className="p-3 bg-indigo-600 text-white rounded-xl hover:bg-indigo-700 transition-all flex items-center justify-center aspect-square"
          >
            <Send size={20} />
          </button>
        </div>
      </div>
    </div>
  );
};

// --- Main App ---

export default function App() {
  return (
    <Router>
      <Routes>
        <Route path="/" element={
          <div className="min-h-screen bg-gray-100 flex items-center justify-center p-4">
            <div className="text-center">
              <h1 className="text-4xl font-black text-gray-900 mb-4 tracking-tight">企业官网示例</h1>
              <p className="text-gray-600 max-w-md mx-auto">
                这是一个集成了实时聊天与企微推送的演示页面。请点击右下角的图标发起咨询。
              </p>
            </div>
            <ChatWidget />
          </div>
        } />
        <Route path="/reply" element={<AgentReplyView />} />
      </Routes>
    </Router>
  );
}
