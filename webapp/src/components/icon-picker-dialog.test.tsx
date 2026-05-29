// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { useState } from 'react';
import { IconPickerDialog } from './icon-picker-dialog';
import { RPG_AWESOME_ICONS } from '@/lib/rpg-awesome-icons';

function Harness({ onSelect }: { onSelect: (s: string) => void }) {
  const [open, setOpen] = useState(true);
  return (
    <IconPickerDialog
      open={open}
      onClose={() => setOpen(false)}
      onSelect={(s) => { onSelect(s); setOpen(false); }}
    />
  );
}

describe('IconPickerDialog', () => {
  it('open=false 면 아무것도 렌더하지 않는다', () => {
    const { container } = render(
      <IconPickerDialog open={false} onClose={() => {}} onSelect={() => {}} />,
    );
    expect(container.textContent).toBe('');
  });

  it('open=true 면 제목과 검색창이 보인다', () => {
    render(
      <IconPickerDialog open={true} onClose={() => {}} onSelect={() => {}} />,
    );
    expect(screen.getByText(/아이콘 선택/)).toBeTruthy();
    expect(screen.getByPlaceholderText(/아이콘 이름 검색/)).toBeTruthy();
  });

  it('검색어 입력 시 일치하는 아이콘만 표시된다', () => {
    render(
      <IconPickerDialog open={true} onClose={() => {}} onSelect={() => {}} />,
    );
    const input = screen.getByPlaceholderText(/아이콘 이름 검색/) as HTMLInputElement;
    fireEvent.change(input, { target: { value: 'broadsword' } });
    // 단일 매칭 — list 안에 정확히 1개
    expect(screen.getAllByRole('button', { name: /broadsword 선택/ }).length).toBe(1);
  });

  it('총 개수 표시는 전체 RPG_AWESOME_ICONS 길이와 일치한다', () => {
    render(
      <IconPickerDialog open={true} onClose={() => {}} onSelect={() => {}} />,
    );
    expect(screen.getByText(new RegExp(`/ ${RPG_AWESOME_ICONS.length} 개`))).toBeTruthy();
  });

  it('기본은 단일 PUA 문자 onSelect (char 형식)', () => {
    const selectSpy = vi.fn();
    render(<Harness onSelect={selectSpy} />);
    // broadsword 선택 (U+E946)
    const input = screen.getByPlaceholderText(/아이콘 이름 검색/) as HTMLInputElement;
    fireEvent.change(input, { target: { value: 'broadsword' } });
    fireEvent.click(screen.getByRole('button', { name: /broadsword 선택/ }));
    expect(selectSpy).toHaveBeenCalledWith(String.fromCodePoint(0xe946));
  });

  it('outputFormat="literal" 이면 \\u{XXXX} 형식 codepoint 문자열', () => {
    const selectSpy = vi.fn();
    render(
      <IconPickerDialog
        open={true}
        onClose={() => {}}
        onSelect={selectSpy}
        outputFormat="literal"
      />,
    );
    const input = screen.getByPlaceholderText(/아이콘 이름 검색/) as HTMLInputElement;
    fireEvent.change(input, { target: { value: 'broadsword' } });
    fireEvent.click(screen.getByRole('button', { name: /broadsword 선택/ }));
    expect(selectSpy).toHaveBeenCalledWith('\\u{E946}');
  });

  it('ESC 키로 닫힌다', () => {
    const onClose = vi.fn();
    render(
      <IconPickerDialog open={true} onClose={onClose} onSelect={() => {}} />,
    );
    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    });
    expect(onClose).toHaveBeenCalled();
  });

  it('백드롭 클릭으로 닫힌다', () => {
    const onClose = vi.fn();
    const { container } = render(
      <IconPickerDialog open={true} onClose={onClose} onSelect={() => {}} />,
    );
    // role=dialog 의 outer 가 백드롭.
    const backdrop = container.querySelector('[role="dialog"]') as HTMLElement;
    fireEvent.click(backdrop);
    expect(onClose).toHaveBeenCalled();
  });

  it('일치 없음 안내', () => {
    render(
      <IconPickerDialog open={true} onClose={() => {}} onSelect={() => {}} />,
    );
    const input = screen.getByPlaceholderText(/아이콘 이름 검색/) as HTMLInputElement;
    fireEvent.change(input, { target: { value: 'xxxx_no_such_icon_xxxx' } });
    expect(screen.getByText(/일치하는 아이콘이 없습니다/)).toBeTruthy();
  });
});
