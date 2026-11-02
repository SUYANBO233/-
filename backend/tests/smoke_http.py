"""Run against a live Next.js proxy; performs computation and GETs only, no database writes."""
import argparse
import json
from urllib.request import Request, urlopen
from common import PARAMS


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument('--base-url', default='http://127.0.0.1:5000')
    args = parser.parse_args()

    def call(operation: str, body: dict | None = None) -> dict:
        request = Request(f'{args.base_url}/api/decision/{operation}',
                          data=json.dumps(body).encode() if body is not None else None,
                          headers={'Content-Type':'application/json'})
        with urlopen(request,timeout=40) as response:
            data = json.load(response)
            print(f'{operation}: HTTP {response.status}')
            return data

    meta = call('meta')
    inference = call('infer-methods',{'params':PARAMS})
    assert next(item['key'] for item in inference['methods'] if item['matched']) == 'bench'
    design = call('design-support',{'params':PARAMS,'methodKey':'bench'})
    support = design['support']
    next(item for item in support if item['key']=='steel')['valNum'] = 160
    checked = call('recheck-safety',{'params':PARAMS,'methodKey':'bench','support':support})
    assert checked['score'] < design['safety']['score']
    report = call('generate-scheme',{'params':PARAMS,'methodKey':'bench','support':support,'mileage':'K3601+200'})
    assert report['algorithm'] == meta['algorithm']
    for page in ('decision','knowledge','scheme'):
        with urlopen(f'{args.base_url}/{page}',timeout=40) as response:
            html = response.read().decode()
            assert 'Application error:' not in html
            print(f'/{page}: HTTP {response.status}')
    print('前端代理 → Python 推荐/设计/校核/报告全链路通过；未执行数据库写入。')


if __name__ == '__main__':
    main()
