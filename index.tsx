import ReactDOM from 'react-dom/client';
import { Toaster } from 'react-hot-toast';
import App from './App';
import { LanguageProvider } from './contexts/LanguageContext';
import './index.css';

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error("Could not find root element to mount to");
}

const root = ReactDOM.createRoot(rootElement);
root.render(
  <LanguageProvider>
    <App />
    <Toaster position="top-center" toastOptions={{ duration: 3000 }} />
  </LanguageProvider>
);
