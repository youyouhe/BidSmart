import { Node } from './types';

export const MOCK_TREE_DATA: Node = {
  id: "root",
  title: "招标文件 - 高性能计算集群采购项目",
  content: "Root Document",
  level: 0,
  children: [
    {
      id: "ch-1",
      title: "1. 招标公告",
      content: "本招标项目为高性能计算集群采购项目，招标人为未来科技有限公司...",
      level: 1,
      children: []
    },
    {
      id: "ch-2",
      title: "2. 投标人须知",
      content: "投标人必须具备独立法人资格，注册资金不低于5000万元...",
      level: 1,
      children: [
        {
          id: "ch-2-1",
          title: "2.1 投标文件的构成",
          content: "投标文件应包括：投标函、开标一览表、技术偏离表...",
          level: 2,
          children: []
        },
        {
          id: "ch-2-2",
          title: "2.2 投标保证金",
          content: "投标保证金金额为人民币10万元整，支付方式为银行转账。",
          level: 2,
          children: []
        }
      ]
    },
    {
      id: "ch-3",
      title: "3. 技术规格书",
      content: "本项目要求提供一套完整的高性能计算(HPC)集群系统。",
      level: 1,
      children: [
        {
          id: "ch-3-1",
          title: "3.1 总体架构要求",
          content: "系统应采用CPU+GPU异构计算架构，支持由Kubernetes进行容器化管理。",
          level: 2,
          children: []
        },
        {
          id: "ch-3-2",
          title: "3.2 计算节点配置",
          content: "每个计算节点应配置：双路 AMD EPYC 9004系列处理器，单颗核心数>=64核；内存>=512GB DDR5。",
          level: 2,
          children: [
             {
                id: "ch-3-2-1",
                title: "3.2.1 处理器详细参数",
                content: "主频>=2.4GHz，三级缓存>=256MB。",
                level: 3,
                children: []
             }
          ]
        },
        {
          id: "ch-3-3",
          title: "3.3 存储系统",
          content: "需配置并行文件系统，可用容量>=500TB，聚合读写带宽>=20GB/s。",
          level: 2,
          children: []
        }
      ]
    },
    {
      id: "ch-4",
      title: "4. 商务及服务要求",
      content: "商务条款及售后服务相关规定。",
      level: 1,
      children: [
        {
          id: "ch-4-1",
          title: "4.1 交付周期",
          content: "合同签订后 30 个自然日内完成设备到货、安装及调试。",
          level: 2,
          children: []
        },
        {
          id: "ch-4-2",
          title: "4.2 质保期",
          content: "提供原厂质保服务，质保期为验收合格之日起 5 年。质保期内提供7x24小时上门服务。",
          level: 2,
          children: []
        }
      ]
    }
  ]
};

export const MOCK_ANSWERS: Record<string, { answer: string, source_node: string, debug_path: string[] }> = {
  default: {
    answer: "我在文档中没有找到完全匹配的内容。请尝试询问关于技术规格、质保期或交付时间的问题。",
    source_node: "Unknown",
    debug_path: ["root"]
  },
  "质保": {
    answer: "根据《4.2 质保期》章节的要求，本项目要求提供原厂质保服务，**质保期为验收合格之日起 5 年**。同时，在质保期内需要提供 7x24 小时的上门服务。",
    source_node: "4.2 质保期",
    debug_path: ["root", "ch-4", "ch-4-2"]
  },
  "内存": {
    answer: "在《3.2 计算节点配置》中规定，每个计算节点的内存要求为 **>=512GB DDR5**。",
    source_node: "3.2 计算节点配置",
    debug_path: ["root", "ch-3", "ch-3-2"]
  },
  "交付": {
    answer: "根据《4.1 交付周期》的规定，中标方需要在**合同签订后 30 个自然日内**完成设备的到货、安装以及调试工作。",
    source_node: "4.1 交付周期",
    debug_path: ["root", "ch-4", "ch-4-1"]
  },
  "CPU": {
    answer: "关于处理器的要求在《3.2 计算节点配置》及《3.2.1 处理器详细参数》中有详细说明：\n1. 需采用双路 AMD EPYC 9004 系列处理器。\n2. 单颗核心数需 >= 64核。\n3. 主频 >= 2.4GHz。\n4. 三级缓存 >= 256MB。",
    source_node: "3.2.1 处理器详细参数",
    debug_path: ["root", "ch-3", "ch-3-2", "ch-3-2-1"]
  }
};

export interface GalleryItem {
  id: string;
  title: string;
  category: string;
  date: string;
  description: string;
}

export const GALLERY_ITEMS: GalleryItem[] = [
  { id: '1', title: 'HPC Cluster Procurement', category: 'IT Procurement', date: '2023-10-15', description: 'High performance computing cluster tender document.' },
  { id: '2', title: 'Office Building Renovation', category: 'Construction', date: '2023-09-01', description: 'Renovation specification for HQ blocks A and B.' },
  { id: '3', title: 'Security Services 2024', category: 'Services', date: '2023-11-20', description: 'Annual security guard and monitoring services contract.' },
  { id: '4', title: 'Data Center Cooling System', category: 'IT Procurement', date: '2023-08-10', description: 'Upgrade requirements for precision air conditioning.' },
  { id: '5', title: 'Employee Insurance Plan', category: 'HR & Admin', date: '2023-07-05', description: 'Group medical and accident insurance coverage.' },
  { id: '6', title: 'Smart City Sensor Network', category: 'IT Procurement', date: '2023-12-01', description: 'IoT sensor deployment for municipal monitoring.' },
];
