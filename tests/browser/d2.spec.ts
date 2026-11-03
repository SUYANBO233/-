import { test,expect,type Page } from '@playwright/test';

async function synchronize(page:Page) {
  await page.goto('/decision');
  await expect(page.getByLabel('施工工作面')).toHaveValue('test_face_a');
  await page.getByLabel('开挖里程桩号').fill('K3601+200');
  await page.getByRole('button',{ name:'同步数据',exact:true }).click();
  await expect(page.getByRole('status').filter({ hasText:'数据来源：' })).not.toContainText('页面初始值');
}
async function design(page:Page) {
  await page.getByRole('button',{ name:'启动智能推理与决策' }).click();
  await page.getByRole('button',{ name:'选择台阶法' }).click();
  await page.getByRole('button',{ name:'确认工法，读取支护模板' }).click();
  await expect(page.getByRole('region',{ name:'完整支护配置' })).toBeVisible();
}
const evaluation=(page:Page) => page.locator('[aria-label="变形控制评价"]').first();
const metric=(page:Page,name:string) => evaluation(page).getByRole('row').filter({ hasText:name });

test.beforeEach(async ({ request }) => {
  for (const code of ['test_settlement_limit','test_convergence_limit']) {
    const response=await request.patch('/api/knowledge/evaluation-criteria',{ data:{ code,version:1,enabled:true } });expect(response.ok()).toBeTruthy();
  }
});

test('合成变形响应、对比图、边界、保存及历史快照',async ({ page,request },info) => {
  const errors:string[]=[];page.on('pageerror',(e) => errors.push(e.message));
  await synchronize(page);await design(page);
  await expect(metric(page,'拱顶沉降').locator('td').nth(2)).toHaveText('8');
  await expect(metric(page,'水平周边收敛').locator('td').nth(2)).toHaveText('6');
  await expect(evaluation(page)).toContainText('临时测试 · 该范围内满足');
  await expect(evaluation(page).getByRole('img',{ name:'变形响应与控制值对比图，单位毫米；具体数值见变形指标明细',exact:true })).toBeVisible();
  await page.getByLabel('钢架间距',{ exact:true }).fill('160');
  await expect(page.getByRole('button',{ name:'生成待复核配置报告' })).toBeDisabled();
  await expect(evaluation(page).getByRole('table')).toHaveCount(0);
  await page.getByRole('button',{ name:'重新检查当前配置' }).click();
  await expect(metric(page,'拱顶沉降').locator('td').nth(2)).toHaveText('10');
  await expect(evaluation(page)).toContainText('临时测试 · 该范围内满足');
  await page.getByLabel('钢架间距',{ exact:true }).fill('240');
  await page.getByRole('button',{ name:'重新检查当前配置' }).click();
  await expect(metric(page,'拱顶沉降').locator('td').nth(2)).toHaveText('12');
  await expect(metric(page,'拱顶沉降').locator('td').nth(1)).toHaveText('8');
  await expect(evaluation(page)).toContainText('临时测试 · 不满足');
  await expect(evaluation(page).locator('.recharts-bar-rectangle')).toHaveCount(6);
  await evaluation(page).screenshot({ path:info.outputPath('deformation-comparison.png') });
  await page.getByRole('button',{ name:'生成待复核配置报告' }).click();
  const pending=page.waitForResponse((r) => r.url().endsWith('/api/scheme/save-decision') && r.request().method()==='POST');
  await page.getByRole('button',{ name:'保存至方案与决策台账' }).click();
  const response=await pending;expect(response.ok(),await response.text()).toBeTruthy();const saved=await response.json();
  expect(saved.report.evaluation.status).toBe('unsatisfied');expect(saved.report.evaluation.response.metrics[0].value).toBe(12);
  expect(saved.report.baselineEvaluation.response.metrics[0].value).toBe(8);
  const history=await (await request.get('/api/scheme')).json();
  const record=history.records.find((row:{ id:number }) => row.id===saved.recordId);expect(record.score).toBeNull();expect(record.evaluationStatus).toBe('unsatisfied');
  await page.goto('/scheme');await page.reload();
  const row=page.getByRole('row').filter({ has:page.getByRole('button',{ name:`删除记录 ${saved.recordId}`,exact:true }) });
  await row.getByRole('button',{ name:'展开明细' }).click();
  await page.getByRole('button',{ name:'查看保存的方案报告' }).last().click();
  await expect(page.getByRole('dialog')).toContainText('临时测试 · 不满足');
  await expect(page.getByRole('dialog').getByRole('row').filter({ hasText:'拱顶沉降' }).locator('td').nth(2)).toHaveText('12');
  expect(errors).toEqual([]);
});

test('四项调整进入当前请求，初始值不变，结果按新配置更新',async ({ page }) => {
  await synchronize(page);await design(page);
  for (const [label,value,expected] of [['钢架间距','160','10'],['喷射混凝土厚度','44','9'],['锚杆长度','6','8'],['超前支护环距','20','7']]) {
    await page.getByLabel(label,{ exact:true }).fill(value);
    const request=page.waitForRequest((r) => r.url().endsWith('/api/decision/recheck-safety'));
    await page.getByRole('button',{ name:'重新检查当前配置' }).click();
    const input=(await request).postDataJSON();expect(input.evaluationContext.stage).toBe('initial-support');
    expect(input.support.some((c:{ valNum:number }) => c.valNum===Number(value))).toBeTruthy();
    await expect(metric(page,'拱顶沉降').locator('td').nth(2)).toHaveText(expected);
    await expect(metric(page,'拱顶沉降').locator('td').nth(1)).toHaveText('8');
  }
});

test('缺失输出保留已知不满足；超范围不外推也不把缺项画成零',async ({ page }) => {
  await synchronize(page);await page.getByLabel('隧道埋深',{ exact:true }).fill('900');await design(page);
  await expect(metric(page,'水平周边收敛').locator('td').nth(2)).toHaveText('—');
  await expect(evaluation(page)).toContainText('临时测试 · 无法评价');
  await page.getByLabel('钢架间距',{ exact:true }).fill('240');await page.getByRole('button',{ name:'重新检查当前配置' }).click();
  await expect(evaluation(page)).toContainText('临时测试 · 不满足');
  await expect(metric(page,'水平周边收敛').locator('td').nth(2)).toHaveText('—');
  await page.getByLabel('锚杆长度',{ exact:true }).fill('8');await page.getByRole('button',{ name:'重新检查当前配置' }).click();
  await expect(evaluation(page)).toContainText('超出测试模型适用范围');
  await expect(metric(page,'拱顶沉降').locator('td').nth(2)).toHaveText('—');
});

test('口径变更使旧结果失效，不兼容阶段与基准明确不可评价',async ({ page }) => {
  await synchronize(page);await design(page);
  await page.getByLabel('评价阶段',{ exact:true }).selectOption('after-excavation');
  await expect(page.getByRole('region',{ name:'完整支护配置' })).toHaveCount(0);
  await design(page);await expect(evaluation(page)).toContainText('测试模型未覆盖该阶段或位移基准');
  await page.getByLabel('评价阶段',{ exact:true }).selectOption('initial-support');
  await page.getByLabel('位移基准',{ exact:true }).selectOption('total');
  await design(page);await expect(evaluation(page)).toContainText('测试模型未覆盖该阶段或位移基准');
});

test('判据页面新版本发布影响新评价，进行中版本冲突，历史快照不变',async ({ page,request }) => {
  await synchronize(page);await design(page);
  await page.getByRole('button',{ name:'生成待复核配置报告' }).click();
  const pending=page.waitForResponse((r) => r.url().endsWith('/api/scheme/save-decision') && r.request().method()==='POST');
  await page.getByRole('button',{ name:'保存至方案与决策台账' }).click();const saved=await (await pending).json();
  const history=await (await request.get('/api/scheme')).json();const id=history.records.find((r:{ id:number;schemeReportId:string }) => r.id===saved.recordId).schemeReportId;
  const oldReport=await (await request.get(`/api/scheme/reports/${id}`)).json();
  const previous=await (await request.get('/api/knowledge/evaluation-criteria')).json();
  const enabled=previous.criteria.find((c:{ code:string;enabled:boolean }) => c.code==='test_settlement_limit' && c.enabled);
  const other=await page.context().newPage();
  try {
    await other.goto('/knowledge');await other.getByRole('button',{ name:'支护体系与参数库',exact:true }).click();
    const manager=other.locator('[aria-label="变形评价判据维护"]');
    const row=manager.getByRole('row').filter({ hasText:'test_settlement_limit v1' });await row.getByRole('button',{ name:'新版本',exact:true }).click();
    const editor=other.getByLabel('判据完整定义');const draft=JSON.parse(await editor.inputValue());
    await editor.fill('{invalid');await other.getByRole('button',{ name:'保存判据版本' }).click();
    await expect(editor).toHaveValue('{invalid');await expect(other.getByRole('dialog').getByRole('alert')).toBeVisible();
    await editor.fill(JSON.stringify({ ...draft,enabled:true,upper:7 }));await other.getByRole('button',{ name:'保存判据版本' }).click();
    await expect(other.getByRole('dialog')).toHaveCount(0);
    await page.getByRole('button',{ name:'重新检查当前配置' }).click();
    await expect(page.getByRole('alert').filter({ hasText:'版本' })).toContainText('版本');
    await expect(page.getByRole('button',{ name:'生成待复核配置报告' })).toBeDisabled();
    await design(page);await expect(evaluation(page)).toContainText('临时测试 · 不满足');
    expect(await (await request.get(`/api/scheme/reports/${id}`)).json()).toEqual(oldReport);
    expect(oldReport.evaluation.status).toBe('satisfied');
  } finally {
    await request.patch('/api/knowledge/evaluation-criteria',{ data:{ code:enabled.code,version:enabled.version,enabled:true } });await other.close();
  }
});

test('重算失败保留输入并可重试，迟到返回不能覆盖新修改',async ({ page }) => {
  await synchronize(page);await design(page);
  await page.route('**/api/decision/recheck-safety',(route) => route.fulfill({ status:503,json:{ message:'测试：模型服务不可用' } }));
  await page.getByLabel('锚杆长度',{ exact:true }).fill('4');await page.getByRole('button',{ name:'重新检查当前配置' }).click();
  await expect(page.getByRole('alert').filter({ hasText:'测试：模型服务不可用' })).toContainText('测试：模型服务不可用');
  await expect(page.getByLabel('锚杆长度',{ exact:true })).toHaveValue('4');
  await expect(page.getByRole('button',{ name:'生成待复核配置报告' })).toBeDisabled();
  await page.unroute('**/api/decision/recheck-safety');
  let release:() => void=() => {};let arrived:() => void=() => {};
  const gate=new Promise<void>((resolve) => { release=resolve; });const ready=new Promise<void>((resolve) => { arrived=resolve; });
  await page.route('**/api/decision/recheck-safety',async (route) => { const response=await route.fetch();arrived();await gate;await route.fulfill({ response }); });
  await page.getByRole('button',{ name:'重新检查当前配置' }).click();await ready;
  await page.getByLabel('锚杆长度',{ exact:true }).fill('6');release();
  await expect(evaluation(page)).toContainText('配置已变化，待重新检查');
  await expect(evaluation(page).getByRole('table')).toHaveCount(0);
  await page.unroute('**/api/decision/recheck-safety');await page.getByRole('button',{ name:'重新检查当前配置' }).click();
  await expect(metric(page,'拱顶沉降').locator('td').nth(2)).toHaveText('7');
});
