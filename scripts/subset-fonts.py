"""게임 글꼴을 실제로 쓰는 글자만 남겨 작게 만든다.
사용: python3 scripts/subset-fonts.py <원본 폰트 폴더>
원본: Google Fonts의 Jua, Black Han Sans (SIL OFL 1.1)
글자를 새로 쓰면(종 이름·문구 추가) 이 스크립트를 다시 돌린다."""
import glob, sys, os
from fontTools import subset

root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
src_dir = sys.argv[1]
chars = set(chr(c) for c in range(0x20, 0x7F))
chars |= set('·…→←↑↓★☆×—–“”‘’%')
for path in glob.glob(os.path.join(root, 'src/**/*.ts'), recursive=True) + [os.path.join(root, 'index.html')]:
    with open(path, encoding='utf-8') as f:
        chars |= set(f.read())
text = ''.join(sorted(c for c in chars if c >= ' ' and not (0x1F000 <= ord(c) <= 0x1FFFF)))
for name in ['Jua-Regular', 'BlackHanSans-Regular']:
    opts = subset.Options()
    opts.flavor = 'woff2'
    opts.layout_features = ['*']
    font = subset.load_font(os.path.join(src_dir, name + '.ttf'), opts)
    s = subset.Subsetter(opts)
    s.populate(text=text)
    s.subset(font)
    out = os.path.join(root, 'src/client/fonts', name + '.woff2')
    subset.save_font(font, out, opts)
    print(name, os.path.getsize(out), 'bytes,', len(text), 'chars')
