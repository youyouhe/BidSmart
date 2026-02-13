import { useState, useEffect, useRef } from 'react';
import toast from 'react-hot-toast';
import {
  X, Building2, Users, Award, Wrench, FileCheck, Save, Download,
  Plus, Trash2, ChevronDown, ChevronUp, Edit3, Check, Camera, Loader2,
} from 'lucide-react';
import type {
  CompanyData, CompanyProfile, CompanyBankInfo,
  TeamMember, PastProject, CapabilityDomain,
} from '../types';
import {
  loadCompanyData, saveCompanyData, exportCompanyDataAsJson,
  createDefaultTeamMember, createDefaultPastProject,
} from '../services/companyDataService';
import { ocrImage, extractFields, type ExtractionType } from '../services/ocrService';

type TabId = 'profile' | 'team' | 'projects' | 'capabilities' | 'documents';

const TABS: { id: TabId; label: string; icon: typeof Building2 }[] = [
  { id: 'profile', label: '公司信息', icon: Building2 },
  { id: 'team', label: '团队成员', icon: Users },
  { id: 'projects', label: '项目业绩', icon: Award },
  { id: 'capabilities', label: '技术能力', icon: Wrench },
  { id: 'documents', label: '资质文件', icon: FileCheck },
];

interface Props {
  isOpen: boolean;
  onClose: () => void;
}

export default function CompanyDataManager({ isOpen, onClose }: Props) {
  const [activeTab, setActiveTab] = useState<TabId>('profile');
  const [data, setData] = useState<CompanyData>(() => loadCompanyData());
  const [isDirty, setIsDirty] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setData(loadCompanyData());
      setIsDirty(false);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const updateData = (patch: Partial<CompanyData>) => {
    setData(prev => ({ ...prev, ...patch }));
    setIsDirty(true);
  };

  const handleSave = () => {
    saveCompanyData(data);
    setIsDirty(false);
    toast.success('公司信息已保存');
  };

  const handleExport = () => {
    exportCompanyDataAsJson(data);
    toast.success('JSON 文件已导出');
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-4xl max-h-[85vh] flex flex-col m-4">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b bg-gray-50 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-blue-100 flex items-center justify-center">
              <Building2 size={18} className="text-blue-600" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-gray-800">公司信息管理</h2>
              <p className="text-xs text-gray-500">管理投标所需的公司资料、团队和业绩信息</p>
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 hover:bg-gray-200 rounded-md transition-colors" title="关闭">
            <X size={20} className="text-gray-500" />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex items-center gap-1 px-6 py-2 border-b border-gray-200 shrink-0 overflow-x-auto">
          {TABS.map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`px-3 py-2 text-sm font-medium rounded-md transition-colors flex items-center gap-1.5 whitespace-nowrap ${
                activeTab === tab.id
                  ? 'bg-blue-50 text-blue-700'
                  : 'text-gray-500 hover:bg-gray-100'
              }`}
            >
              <tab.icon size={14} />
              {tab.label}
            </button>
          ))}
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-6">
          {activeTab === 'profile' && (
            <ProfileTab
              profile={data.profile}
              onChange={profile => updateData({ profile })}
            />
          )}
          {activeTab === 'team' && (
            <TeamTab
              team={data.team}
              onChange={team => updateData({ team })}
            />
          )}
          {activeTab === 'projects' && (
            <ProjectsTab
              projects={data.pastProjects}
              onChange={pastProjects => updateData({ pastProjects })}
            />
          )}
          {activeTab === 'capabilities' && (
            <CapabilitiesTab
              capabilities={data.capabilities}
              onChange={capabilities => updateData({ capabilities })}
            />
          )}
          {activeTab === 'documents' && <DocumentsTab />}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-6 py-4 border-t bg-gray-50 shrink-0">
          <button
            onClick={handleExport}
            className="flex items-center gap-2 px-3 py-2 text-sm font-medium text-gray-600 hover:bg-gray-200 rounded-lg transition-colors"
          >
            <Download size={16} />
            导出 JSON
          </button>
          <div className="flex items-center gap-3">
            <button
              onClick={onClose}
              className="px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-200 rounded-lg transition-colors"
            >
              {isDirty ? '取消' : '关闭'}
            </button>
            <button
              onClick={handleSave}
              disabled={!isDirty}
              className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors disabled:opacity-50"
            >
              <Save size={16} />
              保存
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ─── Shared: TagInput ─────────────────────────────────────────── */

function TagInput({ tags, onChange, placeholder }: {
  tags: string[];
  onChange: (tags: string[]) => void;
  placeholder?: string;
}) {
  const [input, setInput] = useState('');

  const add = () => {
    const v = input.trim();
    if (v && !tags.includes(v)) {
      onChange([...tags, v]);
    }
    setInput('');
  };

  return (
    <div>
      <div className="flex flex-wrap gap-1.5 mb-2">
        {tags.map((tag, i) => (
          <span key={i} className="inline-flex items-center gap-1 px-2.5 py-1 bg-blue-50 text-blue-700 rounded-md text-xs font-medium">
            {tag}
            <button onClick={() => onChange(tags.filter((_, j) => j !== i))} className="hover:text-blue-900">
              <X size={12} />
            </button>
          </span>
        ))}
      </div>
      <div className="flex gap-2">
        <input
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); add(); } }}
          placeholder={placeholder || '输入后按 Enter 添加'}
          className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all"
        />
        <button onClick={add} className="px-3 py-2 text-sm font-medium text-blue-600 hover:bg-blue-50 rounded-lg transition-colors">
          <Plus size={16} />
        </button>
      </div>
    </div>
  );
}

/* ─── Shared: FormField ────────────────────────────────────────── */

function FormField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-1.5">{label}</label>
      {children}
    </div>
  );
}

const inputClass = "w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all text-sm";

/* ─── Shared: OcrButton ───────────────────────────────────────── */

function OcrButton({ label, isProcessing, onClick }: {
  label: string;
  isProcessing: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      disabled={isProcessing}
      className="flex items-center gap-1.5 px-3 py-2 text-sm font-medium text-amber-600 bg-amber-50 hover:bg-amber-100 border border-amber-200 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
    >
      {isProcessing ? <Loader2 size={14} className="animate-spin" /> : <Camera size={14} />}
      {isProcessing ? '识别中...' : label}
    </button>
  );
}

/** Run the two-step OCR pipeline: image → markdown → structured fields */
async function runOcrPipeline(file: File, type: ExtractionType): Promise<Record<string, unknown>> {
  const markdown = await ocrImage(file);
  return await extractFields(markdown, type);
}

/* ─── Tab 1: Profile ───────────────────────────────────────────── */

function ProfileTab({ profile, onChange }: {
  profile: CompanyProfile;
  onChange: (p: CompanyProfile) => void;
}) {
  const [isOcr, setIsOcr] = useState(false);
  const ocrRef = useRef<HTMLInputElement>(null);

  const set = <K extends keyof CompanyProfile>(key: K, val: CompanyProfile[K]) =>
    onChange({ ...profile, [key]: val });

  const setBank = <K extends keyof CompanyBankInfo>(key: K, val: string) =>
    onChange({ ...profile, bank_info: { ...profile.bank_info, [key]: val } });

  const handleOcr = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files?.length) return;
    const file = e.target.files[0];
    e.target.value = '';
    setIsOcr(true);
    try {
      const fields = await runOcrPipeline(file, 'company_profile');
      const merged = { ...profile };
      const map: [string, keyof CompanyProfile][] = [
        ['company_name', 'company_name'], ['legal_representative', 'legal_representative'],
        ['registration_number', 'registration_number'], ['address', 'address'],
        ['registered_capital', 'registered_capital'], ['established_date', 'established_date'],
        ['business_scope', 'business_scope'], ['phone', 'phone'], ['email', 'email'],
        ['website', 'website'],
      ];
      let count = 0;
      for (const [ek, pk] of map) {
        const val = fields[ek];
        if (val && typeof val === 'string' && val.trim()) {
          const cur = merged[pk];
          if (!cur || (typeof cur === 'string' && !cur.trim())) {
            (merged as Record<string, unknown>)[pk] = val.trim();
            count++;
          }
        }
      }
      if (Array.isArray(fields.qualifications) && fields.qualifications.length > 0 && merged.qualifications.length === 0) {
        merged.qualifications = fields.qualifications as string[];
        count++;
      }
      onChange(merged);
      toast.success(`已识别并填入 ${count} 个字段`);
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'OCR 识别失败');
    } finally {
      setIsOcr(false);
    }
  };

  return (
    <div className="space-y-5">
      {/* OCR upload */}
      <div className="flex items-center gap-3">
        <OcrButton label="OCR 营业执照" isProcessing={isOcr} onClick={() => ocrRef.current?.click()} />
        <input ref={ocrRef} type="file" accept=".jpg,.jpeg,.png,.pdf" onChange={handleOcr} className="hidden" />
        <span className="text-xs text-gray-400">上传营业执照图片，自动填充公司信息</span>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <FormField label="公司名称">
          <input value={profile.company_name} onChange={e => set('company_name', e.target.value)} className={inputClass} placeholder="XX科技有限公司" />
        </FormField>
        <FormField label="法定代表人">
          <input value={profile.legal_representative} onChange={e => set('legal_representative', e.target.value)} className={inputClass} />
        </FormField>
        <FormField label="统一社会信用代码">
          <input value={profile.registration_number} onChange={e => set('registration_number', e.target.value)} className={inputClass} placeholder="91110000XXXXXXXXXX" />
        </FormField>
        <FormField label="注册资本">
          <input value={profile.registered_capital} onChange={e => set('registered_capital', e.target.value)} className={inputClass} placeholder="5000万元" />
        </FormField>
        <FormField label="成立日期">
          <input type="date" value={profile.established_date} onChange={e => set('established_date', e.target.value)} className={inputClass} />
        </FormField>
        <FormField label="公司地址">
          <input value={profile.address} onChange={e => set('address', e.target.value)} className={inputClass} />
        </FormField>
        <FormField label="联系电话">
          <input value={profile.phone} onChange={e => set('phone', e.target.value)} className={inputClass} />
        </FormField>
        <FormField label="传真">
          <input value={profile.fax} onChange={e => set('fax', e.target.value)} className={inputClass} />
        </FormField>
        <FormField label="电子邮箱">
          <input type="email" value={profile.email} onChange={e => set('email', e.target.value)} className={inputClass} />
        </FormField>
        <FormField label="公司网站">
          <input value={profile.website} onChange={e => set('website', e.target.value)} className={inputClass} placeholder="https://" />
        </FormField>
      </div>

      <FormField label="经营范围">
        <textarea value={profile.business_scope} onChange={e => set('business_scope', e.target.value)} rows={3} className={inputClass} />
      </FormField>

      <FormField label="企业资质">
        <TagInput tags={profile.qualifications} onChange={q => set('qualifications', q)} placeholder="如: ISO 9001、CMMI 5级" />
      </FormField>

      <div>
        <h3 className="text-sm font-semibold text-gray-800 mb-3">银行账户信息</h3>
        <div className="grid grid-cols-3 gap-4 p-4 bg-gray-50 rounded-lg">
          <FormField label="开户银行">
            <input value={profile.bank_info.bank_name} onChange={e => setBank('bank_name', e.target.value)} className={inputClass} />
          </FormField>
          <FormField label="账户名称">
            <input value={profile.bank_info.account_name} onChange={e => setBank('account_name', e.target.value)} className={inputClass} />
          </FormField>
          <FormField label="银行账号">
            <input value={profile.bank_info.account_number} onChange={e => setBank('account_number', e.target.value)} className={inputClass} />
          </FormField>
        </div>
      </div>
    </div>
  );
}

/* ─── Tab 2: Team ──────────────────────────────────────────────── */

function TeamTab({ team, onChange }: {
  team: TeamMember[];
  onChange: (t: TeamMember[]) => void;
}) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [isOcr, setIsOcr] = useState(false);
  const ocrRef = useRef<HTMLInputElement>(null);

  const addMember = () => {
    const m = createDefaultTeamMember();
    onChange([...team, m]);
    setEditingId(m.id);
  };

  const updateMember = (id: string, patch: Partial<TeamMember>) => {
    onChange(team.map(m => m.id === id ? { ...m, ...patch } : m));
  };

  const removeMember = (id: string) => {
    onChange(team.filter(m => m.id !== id));
    if (editingId === id) setEditingId(null);
  };

  const handleOcr = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files?.length) return;
    const file = e.target.files[0];
    e.target.value = '';
    setIsOcr(true);
    try {
      const fields = await runOcrPipeline(file, 'team_member');
      const m = createDefaultTeamMember();
      if (fields.name && typeof fields.name === 'string') m.name = fields.name;
      if (fields.title && typeof fields.title === 'string') m.title = fields.title;
      if (fields.education && typeof fields.education === 'string') m.education = fields.education;
      if (typeof fields.years_experience === 'number') m.years_experience = fields.years_experience;
      if (Array.isArray(fields.certifications)) m.certifications = fields.certifications as string[];
      if (fields.description && typeof fields.description === 'string') m.description = fields.description;
      onChange([...team, m]);
      setEditingId(m.id);
      toast.success(`已识别团队成员: ${m.name || '未知'}`);
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'OCR 识别失败');
    } finally {
      setIsOcr(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-gray-500">共 {team.length} 名团队成员</p>
        <div className="flex items-center gap-2">
          <OcrButton label="OCR 证书/简历" isProcessing={isOcr} onClick={() => ocrRef.current?.click()} />
          <input ref={ocrRef} type="file" accept=".jpg,.jpeg,.png,.pdf" onChange={handleOcr} className="hidden" />
          <button onClick={addMember} className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors">
            <Plus size={14} /> 添加成员
          </button>
        </div>
      </div>

      {team.length === 0 && (
        <div className="text-center py-12 text-gray-400">
          <Users size={48} className="mx-auto mb-3 opacity-50" />
          <p>暂无团队成员，点击上方按钮添加</p>
        </div>
      )}

      {team.map(member => (
        <div key={member.id} className="border border-gray-200 rounded-lg overflow-hidden">
          {/* Header row */}
          <div className="flex items-center justify-between px-4 py-3 bg-gray-50">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center text-blue-700 text-sm font-semibold">
                {member.name ? member.name[0] : '?'}
              </div>
              <div>
                <span className="font-medium text-gray-900">{member.name || '未填写姓名'}</span>
                {member.role && <span className="ml-2 text-xs text-gray-500">{member.role}</span>}
              </div>
            </div>
            <div className="flex items-center gap-1">
              <button onClick={() => setEditingId(editingId === member.id ? null : member.id)} className="p-1.5 hover:bg-gray-200 rounded-md transition-colors text-gray-500">
                {editingId === member.id ? <ChevronUp size={16} /> : <Edit3 size={16} />}
              </button>
              <button onClick={() => removeMember(member.id)} className="p-1.5 hover:bg-red-50 rounded-md transition-colors text-gray-400 hover:text-red-500">
                <Trash2 size={16} />
              </button>
            </div>
          </div>

          {/* Editable fields */}
          {editingId === member.id && (
            <div className="p-4 space-y-4">
              <div className="grid grid-cols-3 gap-4">
                <FormField label="姓名">
                  <input value={member.name} onChange={e => updateMember(member.id, { name: e.target.value })} className={inputClass} />
                </FormField>
                <FormField label="角色">
                  <select value={member.role} onChange={e => updateMember(member.id, { role: e.target.value })} className={inputClass}>
                    <option value="">选择角色</option>
                    <option value="项目经理">项目经理</option>
                    <option value="技术总监">技术总监</option>
                    <option value="系统架构师">系统架构师</option>
                    <option value="开发工程师">开发工程师</option>
                    <option value="测试工程师">测试工程师</option>
                    <option value="质量经理">质量经理</option>
                    <option value="实施工程师">实施工程师</option>
                    <option value="运维工程师">运维工程师</option>
                  </select>
                </FormField>
                <FormField label="职称">
                  <input value={member.title} onChange={e => updateMember(member.id, { title: e.target.value })} className={inputClass} placeholder="如: 高级工程师" />
                </FormField>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <FormField label="工作经验（年）">
                  <input type="number" min={0} value={member.years_experience} onChange={e => updateMember(member.id, { years_experience: parseInt(e.target.value) || 0 })} className={inputClass} />
                </FormField>
                <FormField label="学历">
                  <input value={member.education} onChange={e => updateMember(member.id, { education: e.target.value })} className={inputClass} placeholder="如: 硕士/计算机科学" />
                </FormField>
              </div>
              <FormField label="资质证书">
                <TagInput tags={member.certifications} onChange={c => updateMember(member.id, { certifications: c })} placeholder="如: PMP、系统架构设计师" />
              </FormField>
              <FormField label="关键项目经历">
                <TagInput tags={member.key_projects} onChange={p => updateMember(member.id, { key_projects: p })} placeholder="项目名称" />
              </FormField>
              <FormField label="简介">
                <textarea value={member.description} onChange={e => updateMember(member.id, { description: e.target.value })} rows={2} className={inputClass} />
              </FormField>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

/* ─── Tab 3: Past Projects ─────────────────────────────────────── */

function ProjectsTab({ projects, onChange }: {
  projects: PastProject[];
  onChange: (p: PastProject[]) => void;
}) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [isOcr, setIsOcr] = useState(false);
  const ocrRef = useRef<HTMLInputElement>(null);

  const addProject = () => {
    const p = createDefaultPastProject();
    onChange([...projects, p]);
    setEditingId(p.id);
  };

  const updateProject = (id: string, patch: Partial<PastProject>) => {
    onChange(projects.map(p => p.id === id ? { ...p, ...patch } : p));
  };

  const removeProject = (id: string) => {
    onChange(projects.filter(p => p.id !== id));
    if (editingId === id) setEditingId(null);
  };

  const handleOcr = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files?.length) return;
    const file = e.target.files[0];
    e.target.value = '';
    setIsOcr(true);
    try {
      const fields = await runOcrPipeline(file, 'past_project');
      const p = createDefaultPastProject();
      if (fields.project_name && typeof fields.project_name === 'string') p.project_name = fields.project_name;
      if (fields.client && typeof fields.client === 'string') p.client = fields.client;
      if (typeof fields.contract_value === 'number') p.contract_value = fields.contract_value;
      if (fields.start_date && typeof fields.start_date === 'string') p.start_date = fields.start_date;
      if (fields.end_date && typeof fields.end_date === 'string') p.end_date = fields.end_date;
      if (fields.description && typeof fields.description === 'string') p.description = fields.description;
      if (fields.domain && typeof fields.domain === 'string') p.domain = fields.domain;
      if (Array.isArray(fields.technologies)) p.technologies = fields.technologies as string[];
      onChange([...projects, p]);
      setEditingId(p.id);
      toast.success(`已识别项目: ${p.project_name || '未知'}`);
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'OCR 识别失败');
    } finally {
      setIsOcr(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-gray-500">共 {projects.length} 个项目业绩</p>
        <div className="flex items-center gap-2">
          <OcrButton label="OCR 合同" isProcessing={isOcr} onClick={() => ocrRef.current?.click()} />
          <input ref={ocrRef} type="file" accept=".jpg,.jpeg,.png,.pdf" onChange={handleOcr} className="hidden" />
          <button onClick={addProject} className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors">
            <Plus size={14} /> 添加项目
          </button>
        </div>
      </div>

      {projects.length === 0 && (
        <div className="text-center py-12 text-gray-400">
          <Award size={48} className="mx-auto mb-3 opacity-50" />
          <p>暂无项目业绩，点击上方按钮添加</p>
        </div>
      )}

      {projects.map(proj => (
        <div key={proj.id} className="border border-gray-200 rounded-lg overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 bg-gray-50">
            <div>
              <span className="font-medium text-gray-900">{proj.project_name || '未填写项目名'}</span>
              {proj.contract_value > 0 && (
                <span className="ml-2 text-xs text-green-600 font-medium">{proj.contract_value} {proj.currency}</span>
              )}
              {proj.client && <span className="ml-2 text-xs text-gray-500">| {proj.client}</span>}
            </div>
            <div className="flex items-center gap-1">
              <button onClick={() => setEditingId(editingId === proj.id ? null : proj.id)} className="p-1.5 hover:bg-gray-200 rounded-md transition-colors text-gray-500">
                {editingId === proj.id ? <ChevronUp size={16} /> : <Edit3 size={16} />}
              </button>
              <button onClick={() => removeProject(proj.id)} className="p-1.5 hover:bg-red-50 rounded-md transition-colors text-gray-400 hover:text-red-500">
                <Trash2 size={16} />
              </button>
            </div>
          </div>

          {editingId === proj.id && (
            <div className="p-4 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <FormField label="项目名称">
                  <input value={proj.project_name} onChange={e => updateProject(proj.id, { project_name: e.target.value })} className={inputClass} />
                </FormField>
                <FormField label="甲方单位">
                  <input value={proj.client} onChange={e => updateProject(proj.id, { client: e.target.value })} className={inputClass} />
                </FormField>
              </div>
              <div className="grid grid-cols-4 gap-4">
                <FormField label="合同金额">
                  <input type="number" min={0} value={proj.contract_value} onChange={e => updateProject(proj.id, { contract_value: parseFloat(e.target.value) || 0 })} className={inputClass} />
                </FormField>
                <FormField label="币种">
                  <select value={proj.currency} onChange={e => updateProject(proj.id, { currency: e.target.value })} className={inputClass}>
                    <option value="万元">万元</option>
                    <option value="元">元</option>
                    <option value="USD">USD</option>
                  </select>
                </FormField>
                <FormField label="开始日期">
                  <input type="date" value={proj.start_date} onChange={e => updateProject(proj.id, { start_date: e.target.value })} className={inputClass} />
                </FormField>
                <FormField label="结束日期">
                  <input type="date" value={proj.end_date} onChange={e => updateProject(proj.id, { end_date: e.target.value })} className={inputClass} />
                </FormField>
              </div>
              <div className="grid grid-cols-3 gap-4">
                <FormField label="所属领域">
                  <input value={proj.domain} onChange={e => updateProject(proj.id, { domain: e.target.value })} className={inputClass} placeholder="如: IT、工程" />
                </FormField>
                <FormField label="团队规模（人）">
                  <input type="number" min={0} value={proj.team_size} onChange={e => updateProject(proj.id, { team_size: parseInt(e.target.value) || 0 })} className={inputClass} />
                </FormField>
                <FormField label="状态">
                  <select value={proj.status} onChange={e => updateProject(proj.id, { status: e.target.value })} className={inputClass}>
                    <option value="completed">已完成</option>
                    <option value="in_progress">进行中</option>
                  </select>
                </FormField>
              </div>
              <FormField label="项目描述">
                <textarea value={proj.description} onChange={e => updateProject(proj.id, { description: e.target.value })} rows={2} className={inputClass} />
              </FormField>
              <FormField label="技术栈">
                <TagInput tags={proj.technologies} onChange={t => updateProject(proj.id, { technologies: t })} placeholder="如: Kubernetes、微服务" />
              </FormField>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

/* ─── Tab 4: Capabilities ──────────────────────────────────────── */

function CapabilitiesTab({ capabilities, onChange }: {
  capabilities: Record<string, CapabilityDomain>;
  onChange: (c: Record<string, CapabilityDomain>) => void;
}) {
  const [newDomain, setNewDomain] = useState('');

  const addDomain = () => {
    const name = newDomain.trim();
    if (name && !(name in capabilities)) {
      onChange({ ...capabilities, [name]: { description: '', areas: [] } });
      setNewDomain('');
    }
  };

  const updateDomain = (domain: string, patch: Partial<CapabilityDomain>) => {
    onChange({ ...capabilities, [domain]: { ...capabilities[domain], ...patch } });
  };

  const removeDomain = (domain: string) => {
    const next = { ...capabilities };
    delete next[domain];
    onChange(next);
  };

  const domains = Object.entries(capabilities);

  return (
    <div className="space-y-4">
      {/* Add domain */}
      <div className="flex gap-2">
        <input
          value={newDomain}
          onChange={e => setNewDomain(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addDomain(); } }}
          placeholder="输入领域名称（如: 云计算、大数据）"
          className={`flex-1 ${inputClass}`}
        />
        <button onClick={addDomain} disabled={!newDomain.trim()} className="flex items-center gap-1.5 px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors disabled:opacity-50">
          <Plus size={14} /> 添加领域
        </button>
      </div>

      {domains.length === 0 && (
        <div className="text-center py-12 text-gray-400">
          <Wrench size={48} className="mx-auto mb-3 opacity-50" />
          <p>暂无技术能力，请添加领域</p>
        </div>
      )}

      {domains.map(([domain, info]) => (
        <div key={domain} className="border border-gray-200 rounded-lg p-4 space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="font-semibold text-gray-800">{domain}</h3>
            <button onClick={() => removeDomain(domain)} className="p-1.5 hover:bg-red-50 rounded-md transition-colors text-gray-400 hover:text-red-500">
              <Trash2 size={16} />
            </button>
          </div>
          <FormField label="领域描述">
            <input value={info.description} onChange={e => updateDomain(domain, { description: e.target.value })} className={inputClass} placeholder="简要描述该领域的整体能力" />
          </FormField>
          <FormField label="能力方向">
            <TagInput tags={info.areas} onChange={areas => updateDomain(domain, { areas })} placeholder="如: 分布式架构设计" />
          </FormField>
        </div>
      ))}
    </div>
  );
}

/* ─── Tab 5: Documents ─────────────────────────────────────────── */

function DocumentsTab() {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const ocrRef = useRef<HTMLInputElement>(null);
  const [files, setFiles] = useState<{ name: string; category: string; uploadedAt: string }[]>(() => {
    try {
      const saved = localStorage.getItem('bidsmart-qualification-docs');
      return saved ? JSON.parse(saved) : [];
    } catch { return []; }
  });
  const [selectedCategory, setSelectedCategory] = useState('');
  const [isOcr, setIsOcr] = useState(false);
  const [ocrText, setOcrText] = useState('');

  const categories = ['营业执照', '资质证书', 'ISO认证', 'CMMI认证', '业绩合同', '财务报告', '社保证明', '其他'];

  const handleUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files?.length) return;
    const file = e.target.files[0];
    const entry = {
      name: file.name,
      category: selectedCategory || '其他',
      uploadedAt: new Date().toISOString().split('T')[0],
    };
    const newFiles = [...files, entry];
    setFiles(newFiles);
    localStorage.setItem('bidsmart-qualification-docs', JSON.stringify(newFiles));
    toast.success(`已记录文件: ${file.name}`);
    e.target.value = '';
  };

  const handleOcr = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files?.length) return;
    const file = e.target.files[0];
    e.target.value = '';
    setIsOcr(true);
    try {
      const text = await ocrImage(file);
      setOcrText(text);
      toast.success('OCR 识别完成');
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'OCR 识别失败');
    } finally {
      setIsOcr(false);
    }
  };

  const removeFile = (index: number) => {
    const newFiles = files.filter((_, i) => i !== index);
    setFiles(newFiles);
    localStorage.setItem('bidsmart-qualification-docs', JSON.stringify(newFiles));
  };

  return (
    <div className="space-y-4">
      <div className="flex items-start gap-2 p-3 bg-blue-50 border border-blue-100 rounded-lg">
        <FileCheck size={16} className="text-blue-600 shrink-0 mt-0.5" />
        <p className="text-xs text-blue-700">
          此处记录公司资质文件清单。实际文件可通过文档库上传和管理，这里用于标书编写时快速引用。
        </p>
      </div>

      {/* Upload area */}
      <div className="flex items-center gap-3">
        <select value={selectedCategory} onChange={e => setSelectedCategory(e.target.value)} className={`${inputClass} max-w-[200px]`}>
          <option value="">选择分类</option>
          {categories.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
        <button
          onClick={() => fileInputRef.current?.click()}
          className="flex items-center gap-1.5 px-3 py-2.5 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors"
        >
          <Plus size={14} /> 添加文件记录
        </button>
        <input ref={fileInputRef} type="file" accept=".pdf,.jpg,.jpeg,.png,.doc,.docx" onChange={handleUpload} className="hidden" />
        <OcrButton label="OCR 识别" isProcessing={isOcr} onClick={() => ocrRef.current?.click()} />
        <input ref={ocrRef} type="file" accept=".jpg,.jpeg,.png,.pdf" onChange={handleOcr} className="hidden" />
      </div>

      {/* File list */}
      {files.length === 0 ? (
        <div className="text-center py-12 text-gray-400">
          <FileCheck size={48} className="mx-auto mb-3 opacity-50" />
          <p>暂无资质文件记录</p>
        </div>
      ) : (
        <div className="border border-gray-200 rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50">
              <tr>
                <th className="text-left px-4 py-2 font-medium text-gray-600">文件名</th>
                <th className="text-left px-4 py-2 font-medium text-gray-600">分类</th>
                <th className="text-left px-4 py-2 font-medium text-gray-600">日期</th>
                <th className="w-12"></th>
              </tr>
            </thead>
            <tbody>
              {files.map((f, i) => (
                <tr key={i} className="border-t border-gray-100 hover:bg-gray-50">
                  <td className="px-4 py-2.5 text-gray-900">{f.name}</td>
                  <td className="px-4 py-2.5">
                    <span className="px-2 py-0.5 bg-gray-100 text-gray-600 rounded text-xs">{f.category}</span>
                  </td>
                  <td className="px-4 py-2.5 text-gray-500">{f.uploadedAt}</td>
                  <td className="px-2 py-2.5">
                    <button onClick={() => removeFile(i)} className="p-1 hover:bg-red-50 rounded text-gray-400 hover:text-red-500">
                      <Trash2 size={14} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* OCR text preview */}
      {ocrText && (
        <div className="border border-gray-200 rounded-lg overflow-hidden">
          <div className="flex items-center justify-between px-4 py-2 bg-gray-50 border-b">
            <span className="text-sm font-medium text-gray-700">OCR 识别结果</span>
            <button onClick={() => setOcrText('')} className="text-xs text-gray-500 hover:text-gray-700">清除</button>
          </div>
          <pre className="p-4 text-xs text-gray-700 whitespace-pre-wrap max-h-64 overflow-y-auto bg-white font-mono leading-relaxed">
            {ocrText}
          </pre>
        </div>
      )}
    </div>
  );
}
