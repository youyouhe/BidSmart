import React, { useState, useEffect } from 'react';
import { ArrowLeft, Search, FileText, Calendar, Filter } from 'lucide-react';
import { useLanguage } from '../contexts/LanguageContext';
import { fetchGalleryItems } from '../services/mockApiService';
import { GalleryItem } from '../constants';
import LanguageSwitcher from './LanguageSwitcher';
import { clsx } from 'clsx';

interface DocumentGalleryProps {
  onBack: () => void;
  onSelect: (id: string) => void;
}

const DocumentGallery: React.FC<DocumentGalleryProps> = ({ onBack, onSelect }) => {
  const { t } = useLanguage();
  const [items, setItems] = useState<GalleryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedCategory, setSelectedCategory] = useState<string>('All');
  const [searchTerm, setSearchTerm] = useState('');

  useEffect(() => {
    fetchGalleryItems().then(data => {
      setItems(data);
      setLoading(false);
    });
  }, []);

  const categories = ['All', ...Array.from(new Set(items.map(i => i.category)))];

  const filteredItems = items.filter(item => {
    const matchesCategory = selectedCategory === 'All' || item.category === selectedCategory;
    const matchesSearch = item.title.toLowerCase().includes(searchTerm.toLowerCase()) || 
                          item.description.toLowerCase().includes(searchTerm.toLowerCase());
    return matchesCategory && matchesSearch;
  });

  return (
    <div className="flex flex-col h-screen bg-gray-50">
      {/* Header */}
      <div className="h-16 bg-white border-b border-gray-200 px-6 flex items-center justify-between shrink-0">
        <div className="flex items-center space-x-4">
          <button 
            onClick={onBack}
            className="p-2 hover:bg-gray-100 rounded-full text-gray-600 transition-colors"
          >
            <ArrowLeft size={20} />
          </button>
          <h1 className="text-lg font-semibold text-gray-800">{t('gallery.title')}</h1>
        </div>
        <LanguageSwitcher />
      </div>

      <div className="flex flex-1 overflow-hidden">
        {/* Sidebar / Filters (Responsive simplified to top bar for now, but let's do a sidebar layout for gallery feeling) */}
        <div className="w-64 bg-white border-r border-gray-200 flex-col hidden md:flex">
           <div className="p-4 border-b border-gray-100">
             <div className="relative">
               <Search className="absolute left-3 top-2.5 text-gray-400" size={16} />
               <input 
                 type="text" 
                 placeholder="Search..." 
                 className="w-full pl-9 pr-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
                 value={searchTerm}
                 onChange={(e) => setSearchTerm(e.target.value)}
               />
             </div>
           </div>
           <div className="flex-1 overflow-y-auto p-3 space-y-1">
             <div className="px-3 py-2 text-xs font-semibold text-gray-400 uppercase tracking-wider">Categories</div>
             {categories.map(cat => (
               <button
                 key={cat}
                 onClick={() => setSelectedCategory(cat)}
                 className={clsx(
                   "w-full text-left px-3 py-2 rounded-lg text-sm font-medium transition-colors flex items-center justify-between",
                   selectedCategory === cat 
                     ? "bg-blue-50 text-blue-700" 
                     : "text-gray-600 hover:bg-gray-50"
                 )}
               >
                 <span>{cat === 'All' ? t('gallery.category.all') : cat}</span>
                 {cat !== 'All' && (
                    <span className="text-xs bg-gray-100 text-gray-500 py-0.5 px-2 rounded-full">
                      {items.filter(i => i.category === cat).length}
                    </span>
                 )}
               </button>
             ))}
           </div>
        </div>

        {/* Main Grid */}
        <div className="flex-1 overflow-y-auto p-6 md:p-8">
           {loading ? (
             <div className="flex items-center justify-center h-full text-gray-400">Loading...</div>
           ) : filteredItems.length === 0 ? (
             <div className="flex flex-col items-center justify-center h-full text-gray-400">
                <Filter size={48} className="mb-4 opacity-20" />
                <p>{t('gallery.no_results')}</p>
             </div>
           ) : (
             <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
               {filteredItems.map(item => (
                 <div 
                   key={item.id}
                   className="group bg-white rounded-xl border border-gray-200 shadow-sm hover:shadow-md transition-all cursor-pointer flex flex-col h-full hover:-translate-y-1"
                   onClick={() => onSelect(item.id)}
                 >
                   <div className="p-5 flex-1">
                     <div className="flex items-start justify-between mb-3">
                       <div className="w-10 h-10 rounded-lg bg-blue-100 flex items-center justify-center text-blue-600 shrink-0">
                         <FileText size={20} />
                       </div>
                       <span className="text-xs font-medium px-2 py-1 bg-gray-100 text-gray-600 rounded-md">
                         {item.category}
                       </span>
                     </div>
                     <h3 className="font-semibold text-gray-900 mb-2 line-clamp-2 group-hover:text-blue-600 transition-colors">
                       {item.title}
                     </h3>
                     <p className="text-sm text-gray-500 line-clamp-3">
                       {item.description}
                     </p>
                   </div>
                   <div className="px-5 py-3 border-t border-gray-50 bg-gray-50/50 flex items-center justify-between text-xs text-gray-400 rounded-b-xl">
                      <div className="flex items-center">
                        <Calendar size={12} className="mr-1.5" />
                        {item.date}
                      </div>
                      <span className="font-medium text-blue-600 opacity-0 group-hover:opacity-100 transition-opacity">
                        {t('gallery.select')} &rarr;
                      </span>
                   </div>
                 </div>
               ))}
             </div>
           )}
        </div>
      </div>
    </div>
  );
};

export default DocumentGallery;
