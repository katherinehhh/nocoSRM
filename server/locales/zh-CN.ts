import type { AppServerResource } from './en-US.js';

const zhCN: AppServerResource = {
  srmApproval: {
    noticeTitle: '采购定标待审批',
    noticeBody:
      '您收到一条新的审批任务，请打开询价单核对报价依据并填写审批意见。',
  },
  showcase: {
    externalTitle: '本地外部系统演示',
    externalNotice: '这是本地演示夹具。真实系统需要配置地址和嵌入权限。',
    externalBody: '外部系统 → NocoBase：订单回执与供应商工作台。',
    board: 'NocoBase 工作看板',
  },
};

export default zhCN;
