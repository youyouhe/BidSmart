import type { CompanyData, CompanyProfile, TeamMember, PastProject, CompanyCapabilities } from '../types';

const STORAGE_KEY = 'bidsmart-company-data';

const DEFAULT_PROFILE: CompanyProfile = {
  company_name: '',
  legal_representative: '',
  registration_number: '',
  address: '',
  phone: '',
  fax: '',
  email: '',
  website: '',
  established_date: '',
  registered_capital: '',
  qualifications: [],
  bank_info: { bank_name: '', account_name: '', account_number: '' },
  business_scope: '',
};

const DEFAULT_DATA: CompanyData = {
  profile: DEFAULT_PROFILE,
  team: [],
  pastProjects: [],
  capabilities: {},
};

export function loadCompanyData(): CompanyData {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      const parsed = JSON.parse(saved);
      return {
        ...DEFAULT_DATA,
        ...parsed,
        profile: { ...DEFAULT_PROFILE, ...parsed.profile },
      };
    }
  } catch (e) {
    console.error('Failed to load company data:', e);
  }
  return DEFAULT_DATA;
}

export function saveCompanyData(data: CompanyData): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch (e) {
    console.error('Failed to save company data:', e);
  }
}

/**
 * Export company data as separate JSON files downloaded as a zip.
 * Falls back to individual JSON downloads if JSZip is not available.
 */
export function exportCompanyDataAsJson(data: CompanyData): void {
  const files: Record<string, unknown> = {
    'profile.json': data.profile,
    'team.json': data.team,
    'past_projects.json': data.pastProjects,
    'capabilities.json': data.capabilities,
  };

  // Download each as individual JSON files
  for (const [filename, content] of Object.entries(files)) {
    const blob = new Blob([JSON.stringify(content, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  }
}

export function createDefaultTeamMember(): TeamMember {
  return {
    id: `member-${Date.now()}`,
    name: '',
    role: '',
    title: '',
    certifications: [],
    years_experience: 0,
    education: '',
    key_projects: [],
    description: '',
  };
}

export function createDefaultPastProject(): PastProject {
  return {
    id: `project-${Date.now()}`,
    project_name: '',
    client: '',
    contract_value: 0,
    currency: '万元',
    start_date: '',
    end_date: '',
    status: 'completed',
    domain: '',
    description: '',
    technologies: [],
    team_size: 0,
  };
}
