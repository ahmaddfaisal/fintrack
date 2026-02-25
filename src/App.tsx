/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useMemo } from 'react';
import { 
  PlusCircle, 
  MinusCircle, 
  TrendingUp, 
  TrendingDown, 
  Wallet, 
  Calendar, 
  Trash2, 
  PieChart as PieChartIcon,
  BarChart3,
  ArrowUpRight,
  ArrowDownRight,
  ChevronLeft,
  ChevronRight,
  Download,
  Upload,
  Settings,
  Cloud,
  CloudOff,
  LogIn,
  LogOut,
  RefreshCw,
  AlertCircle,
  PiggyBank,
  CreditCard,
  Building2,
  MoreHorizontal,
  ArrowRightLeft
} from 'lucide-react';
import { supabase, isSupabaseConfigured } from './lib/supabase';
import { User } from '@supabase/supabase-js';
import { 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer, 
  Cell,
  PieChart,
  Pie,
  Legend
} from 'recharts';
import { format, startOfMonth, endOfMonth, isWithinInterval, parseISO, subMonths, addMonths } from 'date-fns';
import { motion, AnimatePresence } from 'motion/react';
import * as XLSX from 'xlsx';
import { Transaction, TransactionType, Account } from './types';
import { cn, formatCurrency } from './lib/utils';

const CATEGORIES = {
  income: ['Gaji', 'Bonus', 'Investasi', 'Freelance', 'Lainnya'],
  expense: ['Makanan', 'Transportasi', 'Sewa/Cicilan', 'Hiburan', 'Belanja', 'Kesehatan', 'Pendidikan', 'Lainnya'],
  saving: ['Tabungan Darurat', 'Tabungan Nikah', 'Tabungan Rumah', 'Tabungan Kendaraan', 'Investasi Saham/Reksadana', 'Lainnya'],
  transfer: ['Pindah Saldo', 'Tabungan', 'Lainnya']
};

export default function App() {
  const [transactions, setTransactions] = useState<Transaction[]>(() => {
    const saved = localStorage.getItem('fintrack_transactions');
    return saved ? JSON.parse(saved) : [];
  });

  const [accounts, setAccounts] = useState<Account[]>(() => {
    const saved = localStorage.getItem('fintrack_accounts');
    return saved ? JSON.parse(saved) : [];
  });

  const [user, setUser] = useState<User | null>(null);
  const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);
  const [authMode, setAuthMode] = useState<'login' | 'signup'>('login');
  const [authEmail, setAuthEmail] = useState('');
  const [authUsername, setAuthUsername] = useState('');
  const [authPassword, setAuthPassword] = useState('');
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncError, setSyncError] = useState<string | null>(null);

  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [isAdding, setIsAdding] = useState<TransactionType | null>(null);
  const [isAddingAccount, setIsAddingAccount] = useState(false);
  
  const [formData, setFormData] = useState({
    amount: '',
    category: '',
    description: '',
    date: format(new Date(), 'yyyy-MM-dd'),
    account_id: '',
    to_account_id: ''
  });

  const [accountFormData, setAccountFormData] = useState({
    name: '',
    initial_balance: '',
    color: '#10b981'
  });

  // Auth Listener
  useEffect(() => {
    if (!supabase) return;

    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
    });

    return () => subscription.unsubscribe();
  }, []);

  // Sync with Supabase when user changes or app starts
  useEffect(() => {
    if (user) {
      fetchFromSupabase();
    }
  }, [user]);

  useEffect(() => {
    if (!user) {
      localStorage.setItem('fintrack_transactions', JSON.stringify(transactions));
      localStorage.setItem('fintrack_accounts', JSON.stringify(accounts));
    }
  }, [transactions, accounts, user]);

  const fetchFromSupabase = async () => {
    if (!supabase || !user) return;
    setIsSyncing(true);
    setSyncError(null);
    try {
      const { data: transData, error: transError } = await supabase
        .from('transactions')
        .select('*')
        .order('date', { ascending: false });

      if (transError) throw transError;
      if (transData) setTransactions(transData);

      const { data: accData, error: accError } = await supabase
        .from('accounts')
        .select('*');

      if (accError) throw accError;
      if (accData) setAccounts(accData);
    } catch (err: any) {
      setSyncError(err.message);
    } finally {
      setIsSyncing(false);
    }
  };

  const saveToSupabase = async (transaction: Transaction) => {
    if (!supabase || !user) return;
    try {
      const { error } = await supabase
        .from('transactions')
        .insert([{ 
          ...transaction, 
          user_id: user.id,
          username: user.user_metadata?.username || user.email 
        }]);
      if (error) throw error;
    } catch (err: any) {
      setSyncError(err.message);
      throw err; // Re-throw agar alert muncul di UI
    }
  };

  const deleteFromSupabase = async (id: string) => {
    if (!supabase || !user) return;
    try {
      const { error } = await supabase
        .from('transactions')
        .delete()
        .eq('id', id);
      if (error) throw error;
    } catch (err: any) {
      setSyncError(err.message);
    }
  };

  const saveAccountToSupabase = async (account: Account) => {
    if (!supabase || !user) return;
    try {
      const { error } = await supabase
        .from('accounts')
        .insert([{ ...account, user_id: user.id }]);
      if (error) throw error;
    } catch (err: any) {
      setSyncError(err.message);
    }
  };

  const deleteAccountFromSupabase = async (id: string) => {
    if (!supabase || !user) return;
    try {
      const { error } = await supabase
        .from('accounts')
        .delete()
        .eq('id', id);
      if (error) throw error;
    } catch (err: any) {
      setSyncError(err.message);
    }
  };

  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!supabase) return;
    setSyncError(null);
    setIsSyncing(true);

    try {
      let result;
      if (authMode === 'login') {
        result = await supabase.auth.signInWithPassword({
          email: authEmail,
          password: authPassword,
        });
      } else {
        if (!authUsername) throw new Error('Username wajib diisi');
        result = await supabase.auth.signUp({
          email: authEmail,
          password: authPassword,
          options: {
            data: {
              username: authUsername
            }
          }
        });
      }

      if (result.error) throw result.error;
      setIsAuthModalOpen(false);
      setAuthEmail('');
      setAuthUsername('');
      setAuthPassword('');
    } catch (err: any) {
      setSyncError(err.message);
    } finally {
      setIsSyncing(false);
    }
  };

  const handleLogout = async () => {
    if (!supabase) return;
    await supabase.auth.signOut();
    setTransactions([]); // Clear local state on logout
  };

  const monthStart = startOfMonth(currentMonth);
  const monthEnd = endOfMonth(currentMonth);

  const filteredTransactions = useMemo(() => {
    return transactions
      .filter(t => isWithinInterval(parseISO(t.date), { start: monthStart, end: monthEnd }))
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }, [transactions, currentMonth]);

  const stats = useMemo(() => {
    const income = filteredTransactions
      .filter(t => t.type === 'income')
      .reduce((sum, t) => sum + t.amount, 0);
    const expenses = filteredTransactions
      .filter(t => t.type === 'expense')
      .reduce((sum, t) => sum + t.amount, 0);
    const savings = filteredTransactions
      .filter(t => t.type === 'saving')
      .reduce((sum, t) => sum + t.amount, 0);
    return { income, expenses, savings, balance: income - expenses - savings };
  }, [filteredTransactions]);

  const chartData = useMemo(() => {
    // Last 6 months comparison
    const data = [];
    for (let i = 5; i >= 0; i--) {
      const date = subMonths(currentMonth, i);
      const start = startOfMonth(date);
      const end = endOfMonth(date);
      
      const monthTransactions = transactions.filter(t => 
        isWithinInterval(parseISO(t.date), { start, end })
      );

      const income = monthTransactions
        .filter(t => t.type === 'income')
        .reduce((sum, t) => sum + t.amount, 0);
      const expenses = monthTransactions
        .filter(t => t.type === 'expense')
        .reduce((sum, t) => sum + t.amount, 0);
      const savings = monthTransactions
        .filter(t => t.type === 'saving')
        .reduce((sum, t) => sum + t.amount, 0);

      data.push({
        name: format(date, 'MMM'),
        income,
        expenses,
        savings
      });
    }
    return data;
  }, [transactions, currentMonth]);

  const expenseCategoryData = useMemo(() => {
    const categories: Record<string, number> = {};
    filteredTransactions
      .filter(t => t.type === 'expense')
      .forEach(t => {
        categories[t.category] = (categories[t.category] || 0) + t.amount;
      });
    
    return Object.entries(categories).map(([name, value]) => ({ name, value }));
  }, [filteredTransactions]);

  const handleAddTransaction = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.amount || !formData.category || !isAdding) return;

    // Generate a shorter unique ID (8 chars alphanumeric)
    const shortId = 'TX-' + Math.random().toString(36).substring(2, 10).toUpperCase();

    const newTransaction: Transaction = {
      id: shortId,
      type: isAdding,
      amount: parseFloat(formData.amount),
      category: formData.category,
      description: formData.description,
      date: formData.date,
      account_id: formData.account_id || undefined,
      to_account_id: formData.to_account_id || undefined
    };

    setTransactions([newTransaction, ...transactions]);
    if (user) {
      try {
        await saveToSupabase(newTransaction);
      } catch (err: any) {
        alert("Gagal menyimpan ke Cloud: " + err.message);
        // Rollback local state if needed, but usually syncError is enough
      }
    }
    
    setIsAdding(null);
    setFormData({
      amount: '',
      category: '',
      description: '',
      date: format(new Date(), 'yyyy-MM-dd'),
      account_id: '',
      to_account_id: ''
    });
  };

  const handleAddAccount = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!accountFormData.name || !accountFormData.initial_balance) return;

    const newAccount: Account = {
      id: 'ACC-' + Math.random().toString(36).substring(2, 10).toUpperCase(),
      name: accountFormData.name,
      initial_balance: parseFloat(accountFormData.initial_balance),
      color: accountFormData.color
    };

    setAccounts([...accounts, newAccount]);
    if (user) {
      await saveAccountToSupabase(newAccount);
    }

    setIsAddingAccount(false);
    setAccountFormData({
      name: '',
      initial_balance: '',
      color: '#10b981'
    });
  };

  const deleteAccount = async (id: string) => {
    if (confirm('Hapus rekening ini? Semua transaksi terkait akan kehilangan referensi rekeningnya.')) {
      setAccounts(accounts.filter(a => a.id !== id));
      if (user) {
        await deleteAccountFromSupabase(id);
      }
    }
  };

  const accountStats = useMemo(() => {
    return accounts.map(acc => {
      const accTransactions = transactions.filter(t => t.account_id === acc.id || t.to_account_id === acc.id);
      
      const balanceChange = accTransactions.reduce((sum, t) => {
        if (t.type === 'income') return sum + t.amount;
        if (t.type === 'expense') return sum - t.amount;
        if (t.type === 'saving') {
          // If it's a saving WITH a destination account
          if (t.to_account_id === acc.id) return sum + t.amount; // Received as saving
          if (t.account_id === acc.id) return sum - t.amount; // Sent as saving
        }
        if (t.type === 'transfer') {
          if (t.to_account_id === acc.id) return sum + t.amount;
          if (t.account_id === acc.id) return sum - t.amount;
        }
        return sum;
      }, 0);
      
      return {
        ...acc,
        current_balance: acc.initial_balance + balanceChange
      };
    });
  }, [accounts, transactions]);

  const yearlyStats = useMemo(() => {
    const year = currentMonth.getFullYear();
    const yearTransactions = transactions.filter(t => parseISO(t.date).getFullYear() === year);
    const income = yearTransactions.filter(t => t.type === 'income').reduce((sum, t) => sum + t.amount, 0);
    const expenses = yearTransactions.filter(t => t.type === 'expense').reduce((sum, t) => sum + t.amount, 0);
    const savings = yearTransactions.filter(t => t.type === 'saving').reduce((sum, t) => sum + t.amount, 0);
    return { income, expenses, savings, balance: income - expenses - savings, year };
  }, [transactions, currentMonth]);

  const deleteTransaction = async (id: string) => {
    if (confirm('Hapus transaksi ini?')) {
      setTransactions(transactions.filter(t => t.id !== id));
      if (user) {
        await deleteFromSupabase(id);
      }
    }
  };

  const exportData = () => {
    const dataToExport = transactions.map(t => ({
      'ID': t.id,
      'Tanggal': t.date,
      'Tipe': t.type === 'income' ? 'Pemasukan' : t.type === 'expense' ? 'Pengeluaran' : 'Tabungan',
      'Kategori': t.category,
      'Jumlah': t.amount,
      'Deskripsi': t.description
    }));
    const worksheet = XLSX.utils.json_to_sheet(dataToExport);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Transaksi");
    XLSX.writeFile(workbook, `fintrack-data-${format(new Date(), 'yyyy-MM-dd')}.xlsx`);
  };

  const importData = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const data = new Uint8Array(event.target?.result as ArrayBuffer);
        const workbook = XLSX.read(data, { type: 'array' });
        const worksheet = workbook.Sheets[workbook.SheetNames[0]];
        const rawData = XLSX.utils.sheet_to_json(worksheet) as any[];
        
        const imported: Transaction[] = rawData.map(row => ({
          id: row['ID'] || crypto.randomUUID(),
          date: row['Tanggal'] || format(new Date(), 'yyyy-MM-dd'),
          type: row['Tipe'] === 'Pemasukan' ? 'income' : row['Tipe'] === 'Pengeluaran' ? 'expense' : 'saving',
          category: row['Kategori'] || 'Lainnya',
          amount: Number(row['Jumlah']) || 0,
          description: row['Deskripsi'] || ''
        }));

        if (imported.length > 0) {
          setTransactions(imported);
          alert('Data berhasil diimpor dari Excel!');
        }
      } catch (err) {
        alert('Gagal membaca file Excel! Pastikan formatnya sesuai.');
      }
    };
    reader.readAsArrayBuffer(file);
  };

  const COLORS = ['#10b981', '#3b82f6', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#06b6d4', '#71717a'];

  return (
    <div className="min-h-screen bg-[#F8FAFC] text-slate-900 font-sans pb-20">
      {/* Header */}
      <header className="bg-white border-b border-slate-200 sticky top-0 z-30">
        <div className="max-w-5xl mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-10 h-10 bg-emerald-600 rounded-xl flex items-center justify-center text-white shadow-lg shadow-emerald-200">
              <Wallet size={24} />
            </div>
            <div className="flex flex-col -space-y-1">
              <h1 className="text-xl font-bold tracking-tight text-slate-800 leading-tight">FinTrack</h1>
              <p className="text-[10px] font-medium text-slate-400 italic">Stay chill, Fintrack it.</p>
            </div>
          </div>
          
          <div className="flex items-center gap-4">
            <div className="hidden md:flex items-center gap-4 bg-slate-100 p-1 rounded-lg">
              <button 
                onClick={() => setCurrentMonth(subMonths(currentMonth, 1))}
                className="p-1.5 hover:bg-white hover:shadow-sm rounded-md transition-all"
              >
                <ChevronLeft size={18} />
              </button>
              <span className="text-sm font-semibold px-2 min-w-[120px] text-center">
                {format(currentMonth, 'MMMM yyyy')}
              </span>
              <button 
                onClick={() => setCurrentMonth(addMonths(currentMonth, 1))}
                className="p-1.5 hover:bg-white hover:shadow-sm rounded-md transition-all"
              >
                <ChevronRight size={18} />
              </button>
            </div>

            <div className="h-8 w-px bg-slate-200 mx-2 hidden md:block" />

            {isSupabaseConfigured ? (
              user ? (
                <div className="flex items-center gap-3">
                  <div className="flex flex-col items-end">
                    <span className="text-[10px] font-bold text-emerald-600 flex items-center gap-1 uppercase tracking-tighter">
                      <Cloud size={10} /> Cloud Synced
                    </span>
                    <span className="text-xs font-medium text-slate-500 truncate max-w-[120px]">
                      {user.user_metadata?.username || user.email}
                    </span>
                  </div>
                  <button 
                    onClick={handleLogout}
                    className="p-2 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-all"
                    title="Logout"
                  >
                    <LogOut size={20} />
                  </button>
                </div>
              ) : (
                <button 
                  onClick={() => setIsAuthModalOpen(true)}
                  className="flex items-center gap-2 bg-slate-900 text-white text-sm font-bold py-2 px-4 rounded-lg hover:bg-slate-800 transition-all"
                >
                  <LogIn size={18} /> Login Cloud
                </button>
              )
            ) : (
              <div className="flex items-center gap-2 text-slate-400 bg-slate-50 px-3 py-1.5 rounded-lg border border-slate-200">
                <CloudOff size={16} />
                <span className="text-xs font-medium">Local Mode</span>
              </div>
            )}
          </div>
        </div>
        {/* Mobile Month Selector */}
        <div className="md:hidden bg-slate-50 border-t border-slate-200 p-2 flex items-center justify-center gap-4">
          <button onClick={() => setCurrentMonth(subMonths(currentMonth, 1))} className="p-1"><ChevronLeft size={20}/></button>
          <span className="text-sm font-bold">{format(currentMonth, 'MMMM yyyy')}</span>
          <button onClick={() => setCurrentMonth(addMonths(currentMonth, 1))} className="p-1"><ChevronRight size={20}/></button>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 py-8 space-y-8">
        {/* Accounts Section */}
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="font-bold text-slate-800 flex items-center gap-2">
              <Building2 size={20} className="text-slate-400" /> Rekening Saya
            </h3>
            <button 
              onClick={() => setIsAddingAccount(true)}
              className="text-xs font-bold text-emerald-600 hover:text-emerald-700 flex items-center gap-1"
            >
              <PlusCircle size={14} /> Tambah Rekening
            </button>
          </div>
          
          <div className="flex gap-4 overflow-x-auto pb-2 scrollbar-hide">
            {accountStats.length > 0 ? (
              accountStats.map(acc => (
                <motion.div 
                  key={acc.id}
                  whileHover={{ y: -4 }}
                  className="min-w-[240px] bg-white p-5 rounded-2xl border border-slate-200 shadow-sm relative group"
                >
                  <div className="flex items-center justify-between mb-3">
                    <div className="w-10 h-10 rounded-xl flex items-center justify-center text-white shadow-sm" style={{ backgroundColor: acc.color }}>
                      <CreditCard size={20} />
                    </div>
                    <button 
                      onClick={() => deleteAccount(acc.id)}
                      className="p-1.5 text-slate-300 hover:text-rose-600 hover:bg-rose-50 rounded-md opacity-0 group-hover:opacity-100 transition-all"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                  <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">{acc.name}</p>
                  <h4 className="text-xl font-bold text-slate-800 mt-1">{formatCurrency(acc.current_balance)}</h4>
                  <div className="mt-3 pt-3 border-t border-slate-50 flex items-center justify-between">
                    <span className="text-[10px] font-medium text-slate-400">Saldo Awal: {formatCurrency(acc.initial_balance)}</span>
                  </div>
                </motion.div>
              ))
            ) : (
              <div 
                onClick={() => setIsAddingAccount(true)}
                className="w-full py-10 border-2 border-dashed border-slate-200 rounded-2xl flex flex-col items-center justify-center text-slate-400 hover:border-emerald-200 hover:text-emerald-600 cursor-pointer transition-all"
              >
                <PlusCircle size={32} className="mb-2 opacity-20" />
                <p className="text-sm font-medium">Belum ada rekening. Tambah sekarang!</p>
              </div>
            )}
          </div>
        </div>

        {/* Yearly Overview Banner */}
        <div className="bg-slate-800 rounded-2xl p-4 flex flex-wrap items-center justify-between gap-4 text-white">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-slate-700 rounded-lg">
              <Calendar size={20} className="text-slate-300" />
            </div>
            <div>
              <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">Ringkasan Tahun {yearlyStats.year}</p>
              <p className="text-sm font-medium">Total akumulasi keuangan tahun ini</p>
            </div>
          </div>
          <div className="flex items-center gap-6">
            <div className="hidden sm:block">
              <p className="text-[10px] text-slate-400 uppercase">Pemasukan</p>
              <p className="text-sm font-bold text-emerald-400">{formatCurrency(yearlyStats.income)}</p>
            </div>
            <div className="hidden sm:block">
              <p className="text-[10px] text-slate-400 uppercase">Pengeluaran</p>
              <p className="text-sm font-bold text-rose-400">{formatCurrency(yearlyStats.expenses)}</p>
            </div>
            <div className="hidden sm:block">
              <p className="text-[10px] text-slate-400 uppercase">Tabungan</p>
              <p className="text-sm font-bold text-blue-400">{formatCurrency(yearlyStats.savings)}</p>
            </div>
            <div className="sm:border-l border-slate-700 sm:pl-6 flex items-center gap-4">
              <div>
                <p className="text-[10px] text-slate-400 uppercase">Sisa</p>
                <p className="text-sm font-bold text-white">{formatCurrency(yearlyStats.balance)}</p>
              </div>
              <div className="flex gap-2 ml-4">
                <button 
                  onClick={exportData}
                  title="Export Excel"
                  className="p-2 hover:bg-slate-700 rounded-lg transition-colors text-slate-400 hover:text-white"
                >
                  <Download size={18} />
                </button>
                <label 
                  title="Import Excel"
                  className="p-2 hover:bg-slate-700 rounded-lg transition-colors text-slate-400 hover:text-white cursor-pointer"
                >
                  <Upload size={18} />
                  <input type="file" accept=".xlsx, .xls" onChange={importData} className="hidden" />
                </label>
              </div>
            </div>
          </div>
        </div>
        {/* Summary Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm"
          >
            <div className="flex items-center justify-between mb-4">
              <div className="p-2 bg-emerald-50 text-emerald-600 rounded-lg">
                <TrendingUp size={20} />
              </div>
              <span className="text-xs font-bold text-emerald-600 bg-emerald-50 px-2 py-1 rounded-full flex items-center gap-1">
                <ArrowUpRight size={12} /> Pemasukan
              </span>
            </div>
            <p className="text-slate-500 text-sm font-medium">Total Pemasukan</p>
            <h2 className="text-2xl font-bold mt-1 text-emerald-700">{formatCurrency(stats.income)}</h2>
          </motion.div>

          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm"
          >
            <div className="flex items-center justify-between mb-4">
              <div className="p-2 bg-rose-50 text-rose-600 rounded-lg">
                <TrendingDown size={20} />
              </div>
              <span className="text-xs font-bold text-rose-600 bg-rose-50 px-2 py-1 rounded-full flex items-center gap-1">
                <ArrowDownRight size={12} /> Pengeluaran
              </span>
            </div>
            <p className="text-slate-500 text-sm font-medium">Total Pengeluaran</p>
            <h2 className="text-2xl font-bold mt-1 text-rose-700">{formatCurrency(stats.expenses)}</h2>
          </motion.div>

          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.15 }}
            className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm"
          >
            <div className="flex items-center justify-between mb-4">
              <div className="p-2 bg-blue-50 text-blue-600 rounded-lg">
                <PiggyBank size={20} />
              </div>
              <span className="text-xs font-bold text-blue-600 bg-blue-50 px-2 py-1 rounded-full flex items-center gap-1">
                Tabungan
              </span>
            </div>
            <p className="text-slate-500 text-sm font-medium">Total Tabungan</p>
            <h2 className="text-2xl font-bold mt-1 text-blue-700">{formatCurrency(stats.savings)}</h2>
          </motion.div>

          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
            className="bg-slate-900 p-6 rounded-2xl shadow-xl shadow-slate-200"
          >
            <div className="flex items-center justify-between mb-4">
              <div className="p-2 bg-slate-800 text-slate-300 rounded-lg">
                <Wallet size={20} />
              </div>
            </div>
            <p className="text-slate-400 text-sm font-medium">Sisa Saldo</p>
            <h2 className="text-2xl font-bold mt-1 text-white">{formatCurrency(stats.balance)}</h2>
          </motion.div>
        </div>

        {/* Action Buttons */}
        <div className="flex flex-wrap gap-4">
          <button 
            onClick={() => setIsAdding('income')}
            className="flex-1 min-w-[160px] bg-emerald-600 hover:bg-emerald-700 text-white font-bold py-3 px-6 rounded-xl shadow-lg shadow-emerald-100 transition-all flex items-center justify-center gap-2"
          >
            <PlusCircle size={20} /> Tambah Pemasukan
          </button>
          <button 
            onClick={() => setIsAdding('expense')}
            className="flex-1 min-w-[160px] bg-rose-600 hover:bg-rose-700 text-white font-bold py-3 px-6 rounded-xl shadow-lg shadow-rose-100 transition-all flex items-center justify-center gap-2"
          >
            <MinusCircle size={20} /> Tambah Pengeluaran
          </button>
          <button 
            onClick={() => setIsAdding('saving')}
            className="flex-1 min-w-[160px] bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 px-6 rounded-xl shadow-lg shadow-blue-100 transition-all flex items-center justify-center gap-2"
          >
            <PiggyBank size={20} /> Tambah Tabungan
          </button>
          <button 
            onClick={() => setIsAdding('transfer')}
            className="flex-1 min-w-[160px] bg-slate-600 hover:bg-slate-700 text-white font-bold py-3 px-6 rounded-xl shadow-lg shadow-slate-100 transition-all flex items-center justify-center gap-2"
          >
            <ArrowRightLeft size={20} /> Transfer Antar Bank
          </button>
        </div>

        {/* Charts Section */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
            <div className="flex items-center gap-2 mb-6">
              <BarChart3 size={20} className="text-slate-400" />
              <h3 className="font-bold text-slate-800">Perbandingan 6 Bulan Terakhir</h3>
            </div>
            <div className="h-[300px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                  <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fill: '#64748b', fontSize: 12 }} />
                  <YAxis hide />
                  <Tooltip 
                    cursor={{ fill: '#f8fafc' }}
                    contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' }}
                    formatter={(value: number) => formatCurrency(value)}
                  />
                  <Bar dataKey="income" fill="#10b981" radius={[4, 4, 0, 0]} name="Pemasukan" />
                  <Bar dataKey="expenses" fill="#ef4444" radius={[4, 4, 0, 0]} name="Pengeluaran" />
                  <Bar dataKey="savings" fill="#3b82f6" radius={[4, 4, 0, 0]} name="Tabungan" />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
            <div className="flex items-center gap-2 mb-6">
              <PieChartIcon size={20} className="text-slate-400" />
              <h3 className="font-bold text-slate-800">Alokasi Pengeluaran</h3>
            </div>
            <div className="h-[300px] w-full">
              {expenseCategoryData.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={expenseCategoryData}
                      cx="50%"
                      cy="50%"
                      innerRadius={60}
                      outerRadius={80}
                      paddingAngle={5}
                      dataKey="value"
                    >
                      {expenseCategoryData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip formatter={(value: number) => formatCurrency(value)} />
                    <Legend verticalAlign="bottom" height={36}/>
                  </PieChart>
                </ResponsiveContainer>
              ) : (
                <div className="h-full flex flex-col items-center justify-center text-slate-400">
                  <PieChartIcon size={48} className="mb-2 opacity-20" />
                  <p className="text-sm">Belum ada data pengeluaran</p>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Transactions List */}
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="p-6 border-b border-slate-100 flex items-center justify-between">
            <h3 className="font-bold text-slate-800">Transaksi Terkini</h3>
            <span className="text-xs font-medium text-slate-500 bg-slate-100 px-2 py-1 rounded-md">
              {filteredTransactions.length} Transaksi
            </span>
          </div>
          <div className="divide-y divide-slate-100">
            {filteredTransactions.length > 0 ? (
              filteredTransactions.map((t) => (
                <motion.div 
                  layout
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  key={t.id} 
                  className="p-4 hover:bg-slate-50 transition-colors flex items-center justify-between group"
                >
                  <div className="flex items-center gap-4">
                    <div className={cn(
                      "w-10 h-10 rounded-xl flex items-center justify-center",
                      t.type === 'income' ? "bg-emerald-50 text-emerald-600" : 
                      t.type === 'expense' ? "bg-rose-50 text-rose-600" : 
                      t.type === 'saving' ? "bg-blue-50 text-blue-600" : "bg-slate-50 text-slate-600"
                    )}>
                      {t.type === 'income' ? <TrendingUp size={20} /> : 
                       t.type === 'expense' ? <TrendingDown size={20} /> : 
                       t.type === 'saving' ? <PiggyBank size={20} /> : <ArrowRightLeft size={20} />}
                    </div>
                    <div>
                      <p className="font-bold text-slate-800">{t.category}</p>
                      <p className="text-xs text-slate-500">
                        {t.description || 'Tanpa deskripsi'} • {format(parseISO(t.date), 'dd MMM yyyy')}
                        <div className="mt-1 flex flex-wrap gap-1">
                          {t.account_id && (
                            <span className="px-1.5 py-0.5 bg-slate-100 rounded text-[10px] font-bold text-slate-400">
                              {t.type === 'transfer' || t.type === 'saving' ? 'Dari: ' : ''}
                              {accounts.find(a => a.id === t.account_id)?.name || 'Unknown'}
                            </span>
                          )}
                          {t.to_account_id && (
                            <span className="px-1.5 py-0.5 bg-blue-50 rounded text-[10px] font-bold text-blue-400">
                              Ke: {accounts.find(a => a.id === t.to_account_id)?.name || 'Unknown'}
                            </span>
                          )}
                        </div>
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-4">
                    <p className={cn(
                      "font-bold text-right",
                      t.type === 'income' ? "text-emerald-600" : 
                      t.type === 'expense' ? "text-rose-600" : 
                      t.type === 'saving' ? "text-blue-600" : "text-slate-600"
                    )}>
                      {t.type === 'income' ? '+' : t.type === 'expense' ? '-' : t.type === 'saving' ? '•' : '⇄'}{formatCurrency(t.amount)}
                    </p>
                    <button 
                      onClick={() => deleteTransaction(t.id)}
                      className="p-2 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-all opacity-100 md:opacity-0 md:group-hover:opacity-100"
                    >
                      <Trash2 size={18} />
                    </button>
                  </div>
                </motion.div>
              ))
            ) : (
              <div className="py-12 flex flex-col items-center justify-center text-slate-400">
                <Calendar size={48} className="mb-2 opacity-20" />
                <p className="text-sm">Tidak ada transaksi di bulan ini</p>
              </div>
            )}
          </div>
        </div>
      </main>

      {/* Modal Form */}
      <AnimatePresence>
        {isAdding && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsAdding(null)}
              className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm"
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="relative bg-white w-full max-w-md rounded-3xl shadow-2xl overflow-hidden"
            >
              <div className={cn(
                "p-6 text-white flex items-center justify-between",
                isAdding === 'income' ? "bg-emerald-600" : 
                isAdding === 'expense' ? "bg-rose-600" : 
                isAdding === 'saving' ? "bg-blue-600" : "bg-slate-600"
              )}>
                <h3 className="text-xl font-bold flex items-center gap-2">
                  {isAdding === 'income' ? <PlusCircle /> : 
                   isAdding === 'expense' ? <MinusCircle /> : 
                   isAdding === 'saving' ? <PiggyBank /> : <ArrowRightLeft />}
                  Tambah {
                    isAdding === 'income' ? 'Pemasukan' : 
                    isAdding === 'expense' ? 'Pengeluaran' : 
                    isAdding === 'saving' ? 'Tabungan' : 'Transfer'
                  }
                </h3>
                <button onClick={() => setIsAdding(null)} className="hover:bg-white/20 p-1 rounded-full transition-colors">
                  <ChevronLeft className="rotate-90" />
                </button>
              </div>
              
              <form onSubmit={handleAddTransaction} className="p-6 space-y-4">
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Jumlah (Rp)</label>
                  <input 
                    type="number" 
                    required
                    autoFocus
                    placeholder="0"
                    value={formData.amount}
                    onChange={e => setFormData({...formData, amount: e.target.value})}
                    className="w-full text-2xl font-bold p-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-slate-900 focus:border-transparent outline-none transition-all"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Kategori</label>
                  <select 
                    required
                    value={formData.category}
                    onChange={e => setFormData({...formData, category: e.target.value})}
                    className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-slate-900 focus:border-transparent outline-none transition-all appearance-none"
                  >
                    <option value="">Pilih Kategori</option>
                    {CATEGORIES[isAdding].map(cat => (
                      <option key={cat} value={cat}>{cat}</option>
                    ))}
                  </select>
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">
                    {isAdding === 'transfer' || isAdding === 'saving' ? 'Dari Rekening' : 'Pilih Rekening'}
                  </label>
                  <select 
                    required
                    value={formData.account_id}
                    onChange={e => setFormData({...formData, account_id: e.target.value})}
                    className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-slate-900 focus:border-transparent outline-none transition-all appearance-none"
                  >
                    <option value="">Pilih Rekening</option>
                    {accounts.map(acc => (
                      <option key={acc.id} value={acc.id}>{acc.name}</option>
                    ))}
                  </select>
                </div>

                {(isAdding === 'transfer' || isAdding === 'saving') && (
                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">
                      Ke Rekening (Tujuan)
                    </label>
                    <select 
                      required={isAdding === 'transfer'}
                      value={formData.to_account_id}
                      onChange={e => setFormData({...formData, to_account_id: e.target.value})}
                      className="w-full p-3 bg-blue-50 border border-blue-100 rounded-xl focus:ring-2 focus:ring-blue-600 focus:border-transparent outline-none transition-all appearance-none"
                    >
                      <option value="">{isAdding === 'saving' ? 'Pilih Rekening (Opsional)' : 'Pilih Rekening Tujuan'}</option>
                      {accounts.filter(acc => acc.id !== formData.account_id).map(acc => (
                        <option key={acc.id} value={acc.id}>{acc.name}</option>
                      ))}
                    </select>
                    {isAdding === 'saving' && (
                      <p className="text-[10px] text-slate-400 italic">
                        * Jika dipilih, saldo akan dipindahkan ke rekening ini. Jika dikosongkan, hanya mencatat tabungan tanpa pindah saldo.
                      </p>
                    )}
                  </div>
                )}

                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Tanggal</label>
                  <input 
                    type="date" 
                    required
                    value={formData.date}
                    onChange={e => setFormData({...formData, date: e.target.value})}
                    className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-slate-900 focus:border-transparent outline-none transition-all"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Deskripsi (Opsional)</label>
                  <input 
                    type="text" 
                    placeholder="Contoh: Gaji bulan ini"
                    value={formData.description}
                    onChange={e => setFormData({...formData, description: e.target.value})}
                    className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-slate-900 focus:border-transparent outline-none transition-all"
                  />
                </div>

                <button 
                  type="submit"
                  disabled={isSyncing}
                  className={cn(
                    "w-full py-4 rounded-xl text-white font-bold shadow-lg transition-all active:scale-[0.98] mt-4 flex items-center justify-center gap-2",
                    isAdding === 'income' ? "bg-emerald-600 hover:bg-emerald-700 shadow-emerald-100" : 
                    isAdding === 'expense' ? "bg-rose-600 hover:bg-rose-700 shadow-rose-100" : 
                    isAdding === 'saving' ? "bg-blue-600 hover:bg-blue-700 shadow-blue-100" : "bg-slate-600 hover:bg-slate-700 shadow-slate-100",
                    isSyncing && "opacity-50 cursor-not-allowed"
                  )}
                >
                  {isSyncing ? <RefreshCw className="animate-spin" size={20} /> : 'Simpan Transaksi'}
                </button>
              </form>
            </motion.div>
          </div>
        )}

        {isAuthModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsAuthModalOpen(false)}
              className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm"
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="relative bg-white w-full max-w-md rounded-3xl shadow-2xl overflow-hidden"
            >
              <div className="p-6 bg-slate-900 text-white flex items-center justify-between">
                <h3 className="text-xl font-bold flex items-center gap-2">
                  <Cloud /> {authMode === 'login' ? 'Login Cloud' : 'Daftar Akun'}
                </h3>
                <button onClick={() => setIsAuthModalOpen(false)} className="hover:bg-white/20 p-1 rounded-full transition-colors">
                  <ChevronLeft className="rotate-90" />
                </button>
              </div>
              
              <form onSubmit={handleAuth} className="p-6 space-y-4">
                {syncError && (
                  <div className="p-3 bg-rose-50 text-rose-600 text-xs font-bold rounded-lg flex items-center gap-2 border border-rose-100">
                    <AlertCircle size={14} /> {syncError}
                  </div>
                )}
                
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Email</label>
                  <input 
                    type="email" 
                    required
                    value={authEmail}
                    onChange={e => setAuthEmail(e.target.value)}
                    className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-slate-900 outline-none"
                  />
                </div>

                {authMode === 'signup' && (
                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Username</label>
                    <input 
                      type="text" 
                      required
                      placeholder="Contoh: budi_finance"
                      value={authUsername}
                      onChange={e => setAuthUsername(e.target.value)}
                      className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-slate-900 outline-none"
                    />
                  </div>
                )}

                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Password</label>
                  <input 
                    type="password" 
                    required
                    value={authPassword}
                    onChange={e => setAuthPassword(e.target.value)}
                    className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-slate-900 outline-none"
                  />
                </div>

                <button 
                  type="submit"
                  disabled={isSyncing}
                  className="w-full py-4 bg-slate-900 hover:bg-slate-800 text-white font-bold rounded-xl shadow-lg transition-all flex items-center justify-center gap-2"
                >
                  {isSyncing ? <RefreshCw className="animate-spin" size={20} /> : (authMode === 'login' ? 'Masuk' : 'Daftar')}
                </button>

                <p className="text-center text-sm text-slate-500">
                  {authMode === 'login' ? 'Belum punya akun?' : 'Sudah punya akun?'}
                  <button 
                    type="button"
                    onClick={() => setAuthMode(authMode === 'login' ? 'signup' : 'login')}
                    className="ml-1 text-slate-900 font-bold hover:underline"
                  >
                    {authMode === 'login' ? 'Daftar Sekarang' : 'Login Disini'}
                  </button>
                </p>
              </form>
            </motion.div>
          </div>
        )}

        {isAddingAccount && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsAddingAccount(false)}
              className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm"
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="relative bg-white w-full max-w-md rounded-3xl shadow-2xl overflow-hidden"
            >
              <div className="p-6 bg-emerald-600 text-white flex items-center justify-between">
                <h3 className="text-xl font-bold flex items-center gap-2">
                  <Building2 /> Tambah Rekening
                </h3>
                <button onClick={() => setIsAddingAccount(false)} className="hover:bg-white/20 p-1 rounded-full transition-colors">
                  <ChevronLeft className="rotate-90" />
                </button>
              </div>
              
              <form onSubmit={handleAddAccount} className="p-6 space-y-4">
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Nama Rekening</label>
                  <input 
                    type="text" 
                    required
                    placeholder="Contoh: Mandiri, BRI, Dompet"
                    value={accountFormData.name}
                    onChange={e => setAccountFormData({...accountFormData, name: e.target.value})}
                    className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-emerald-600 outline-none"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Saldo Awal (Rp)</label>
                  <input 
                    type="number" 
                    required
                    placeholder="0"
                    value={accountFormData.initial_balance}
                    onChange={e => setAccountFormData({...accountFormData, initial_balance: e.target.value})}
                    className="w-full text-xl font-bold p-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-emerald-600 outline-none"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Warna Tema</label>
                  <div className="flex gap-2 flex-wrap">
                    {['#10b981', '#3b82f6', '#f59e0b', '#ef4444', '#8b5cf6', '#0f172a'].map(c => (
                      <button
                        key={c}
                        type="button"
                        onClick={() => setAccountFormData({...accountFormData, color: c})}
                        className={cn(
                          "w-8 h-8 rounded-full border-2 transition-all",
                          accountFormData.color === c ? "border-slate-900 scale-110" : "border-transparent"
                        )}
                        style={{ backgroundColor: c }}
                      />
                    ))}
                  </div>
                </div>

                <button 
                  type="submit"
                  className="w-full py-4 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-xl shadow-lg transition-all flex items-center justify-center gap-2 mt-4"
                >
                  Simpan Rekening
                </button>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
