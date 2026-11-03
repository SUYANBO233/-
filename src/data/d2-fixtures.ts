import { criterionSchema } from '@/lib/response';
export const D2_TEST_BATCH='d2_synthetic_v1';
export const D2_CRITERIA=['settlement','convergence'].flatMap((metric) => [1,2].map((version) => criterionSchema.parse({
  code:`test_${metric}_limit`,version,enabled:version===1,metric,name:metric==='settlement' ? '测试拱顶沉降':'测试水平收敛',
  unit:'mm',stage:'initial-support',displacementReference:'since-excavation',sectionTypes:['主洞标准断面'],operator:'<=',lower:null,
  upper:version===1 ? (metric==='settlement' ? 10:8) : (metric==='settlement' ? 7:5),required:true,
  basis:'软件测试专用阈值，非工程控制值、非规范判据',source:'simulation',testBatchId:D2_TEST_BATCH,
})));
