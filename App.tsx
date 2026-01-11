
import React, { useState, useCallback, useRef, useEffect } from 'react';
import { AppState, ExamConfig, ExamResult, Student } from './types.ts';
import { scanExamPaper } from './services/geminiService.ts';
import { BookIcon, CameraIcon, CheckIcon, DownloadIcon, UserIcon } from './components/Icons.tsx';

// Global declaration for XLSX (from CDN in index.html)
declare var XLSX: any;

export default function App() {
  const [appState, setAppState] = useState<AppState>(AppState.SETUP);
  const [showHistory, setShowHistory] = useState(false);
  const [config, setConfig] = useState<ExamConfig>({
    subject: '',
    totalQuestions: 10,
    answerKey: [],
    students: [],
  });
  const [results, setResults] = useState<ExamResult[]>([]);
  const [currentStudentIndex, setCurrentStudentIndex] = useState(0);
  const [isScanning, setIsScanning] = useState(false);
  const [currentScanResult, setCurrentScanResult] = useState<{ score: number, detected: string[] } | null>(null);

  // Form Inputs
  const [inputSubject, setInputSubject] = useState('');
  const [inputTotal, setInputTotal] = useState('10');
  const [inputStudents, setInputStudents] = useState('');
  const [answerKeyArray, setAnswerKeyArray] = useState<string[]>(Array(10).fill(''));

  // Video Refs
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // Update answerKeyArray when total questions change
  useEffect(() => {
    const total = parseInt(inputTotal) || 0;
    if (total > 0) {
      setAnswerKeyArray(prev => {
        const next = [...prev];
        if (next.length < total) {
          return [...next, ...Array(total - next.length).fill('')];
        } else if (next.length > total) {
          return next.slice(0, total);
        }
        return next;
      });
    }
  }, [inputTotal]);

  const handleAnswerChange = (index: number, value: string) => {
    const newAnswers = [...answerKeyArray];
    newAnswers[index] = value.trim().substring(0, 1);
    setAnswerKeyArray(newAnswers);
  };

  const startExam = () => {
    const studentLines = inputStudents.trim().split('\n');
    const parsedStudents: Student[] = studentLines.map(line => {
      const parts = line.split(',').map(s => s.trim());
      const id = parts[0] || '';
      const name = parts[1] || '';
      return { id, name };
    }).filter(s => s.name !== '' || s.id !== '');

    if (parsedStudents.length === 0) {
      alert("กรุณาระบุรายชื่อนักเรียนอย่างน้อย 1 คน");
      return;
    }

    if (!inputSubject) {
      alert("กรุณาระบุชื่อวิชา");
      return;
    }

    setConfig({
      subject: inputSubject,
      totalQuestions: parseInt(inputTotal),
      answerKey: answerKeyArray,
      students: parsedStudents,
    });
    setAppState(AppState.SCANNING);
    setCurrentStudentIndex(0);
  };

  const initCamera = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ 
        video: { 
          facingMode: 'environment',
          width: { ideal: 1920 },
          height: { ideal: 1080 }
        } 
      });
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
      }
    } catch (err) {
      console.error("Camera access failed", err);
      if (appState === AppState.SCANNING) {
        alert("กรุณาอนุญาตสิทธิ์การเข้าถึงกล้อง");
      }
    }
  };

  useEffect(() => {
    if (appState === AppState.SCANNING && !showHistory) {
      initCamera();
    }
  }, [appState, showHistory]);

  const handleScan = async () => {
    if (!videoRef.current || !canvasRef.current || isScanning) return;
    setIsScanning(true);

    const canvas = canvasRef.current;
    const video = videoRef.current;
    
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext('2d');
    
    if (ctx) {
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      const base64Image = canvas.toDataURL('image/jpeg', 0.92).split(',')[1];

      try {
        const result = await scanExamPaper(base64Image, config.totalQuestions);
        const { detectedAnswers } = result;
        
        let score = 0;
        const finalAnswers = Array.isArray(detectedAnswers) ? detectedAnswers : [];
        
        finalAnswers.forEach((ans, idx) => {
          if (ans && config.answerKey[idx] && ans.trim() === config.answerKey[idx].trim()) {
            score++;
          }
        });

        setCurrentScanResult({ score, detected: finalAnswers });
        setAppState(AppState.REVIEW);
      } catch (err: any) {
        console.error("Scan Error:", err);
        alert(err.message || "การสแกนล้มเหลว กรุณาลองใหม่");
      } finally {
        setIsScanning(false);
      }
    }
  };

  const confirmResult = () => {
    if (!currentScanResult) return;

    const student = config.students[currentStudentIndex];
    const newResult: ExamResult = {
      studentId: student.id,
      studentName: student.name,
      score: currentScanResult.score,
      total: config.totalQuestions,
      detectedAnswers: currentScanResult.detected,
      scanDate: new Date().toLocaleString('th-TH'),
    };

    setResults(prev => [...prev, newResult]);
    setCurrentScanResult(null);

    if (currentStudentIndex + 1 < config.students.length) {
      setCurrentStudentIndex(prev => prev + 1);
      setAppState(AppState.SCANNING);
    } else {
      setAppState(AppState.COMPLETED);
    }
  };

  const exportExcel = () => {
    const data = results.map(r => ({
      'เลขที่': r.studentId,
      'ชื่อ-นามสกุล': r.studentName,
      'คะแนนที่ได้': r.score,
      'คะแนนเต็ม': r.total,
      'คิดเป็นร้อยละ': ((r.score / r.total) * 100).toFixed(1) + '%',
      'วันที่ตรวจ': r.scanDate
    }));

    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "ผลการสอบ");
    XLSX.writeFile(wb, `ผลสอบ_${config.subject}.xlsx`);
  };

  const HistoryOverlay = () => (
    <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div className="bg-white w-full max-w-2xl max-h-[90vh] rounded-t-3xl sm:rounded-3xl shadow-2xl flex flex-col overflow-hidden">
        <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-indigo-50">
          <div>
            <h3 className="text-xl font-bold text-slate-800">ประวัติการตรวจข้อสอบ</h3>
            <p className="text-sm text-slate-500">{config.subject} ({results.length}/{config.students.length} คน)</p>
          </div>
          <button 
            onClick={() => setShowHistory(false)}
            className="w-10 h-10 rounded-full bg-white shadow-sm flex items-center justify-center text-slate-400 hover:text-slate-600 transition-all"
          >
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-6 h-6">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        
        <div className="flex-1 overflow-y-auto p-4">
          {results.length === 0 ? (
            <div className="py-20 text-center">
              <div className="bg-slate-100 w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4 text-slate-400">
                <BookIcon className="w-8 h-8" />
              </div>
              <p className="text-slate-500 font-medium">ยังไม่มีข้อมูลการตรวจ</p>
            </div>
          ) : (
            <div className="overflow-hidden border border-slate-100 rounded-xl">
              <table className="w-full text-left">
                <thead className="bg-slate-50 border-b border-slate-100 text-xs font-bold text-slate-400 uppercase tracking-wider">
                  <tr>
                    <th className="px-4 py-3">เลขที่</th>
                    <th className="px-4 py-3">ชื่อนักเรียน</th>
                    <th className="px-4 py-3 text-right">คะแนน</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {results.map((r, i) => (
                    <tr key={i} className="hover:bg-indigo-50/30 transition-colors">
                      <td className="px-4 py-3 text-slate-500 font-mono text-sm">{r.studentId}</td>
                      <td className="px-4 py-3 text-slate-700 font-medium">{r.studentName}</td>
                      <td className="px-4 py-3 text-right">
                        <span className={`font-bold ${r.score / r.total >= 0.5 ? 'text-green-600' : 'text-red-500'}`}>
                          {r.score} / {r.total}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <div className="p-6 border-t border-slate-100 bg-white">
          <button 
            onClick={exportExcel}
            disabled={results.length === 0}
            className="w-full bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white font-bold py-3 rounded-xl transition-all flex items-center justify-center gap-2"
          >
            <DownloadIcon className="w-5 h-5" />
            ส่งออกเป็น Excel
          </button>
        </div>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen pb-12">
      {showHistory && <HistoryOverlay />}

      <header className="bg-indigo-600 text-white p-6 shadow-md">
        <div className="max-w-4xl mx-auto flex items-center gap-3">
          <BookIcon className="w-8 h-8" />
          <h1 className="text-2xl font-bold tracking-tight">ระบบตรวจข้อสอบ AI</h1>
        </div>
      </header>

      <main className="max-w-4xl mx-auto p-4 mt-6">
        {appState === AppState.SETUP && (
          <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-8">
            <h2 className="text-xl font-bold mb-6 text-slate-800 flex items-center gap-2">
              <span className="bg-indigo-100 text-indigo-600 w-8 h-8 rounded-full flex items-center justify-center text-sm">1</span>
              ตั้งค่ารายวิชา
            </h2>
            
            <div className="space-y-6">
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-1">ชื่อวิชา</label>
                <input 
                  type="text" 
                  value={inputSubject} 
                  onChange={e => setInputSubject(e.target.value)}
                  placeholder="เช่น คณิตศาสตร์ ป.6"
                  className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:ring-2 focus:ring-indigo-500 focus:outline-none transition-all"
                />
              </div>

              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-1">จำนวนข้อสอบ</label>
                <input 
                  type="number" 
                  value={inputTotal} 
                  onChange={e => setInputTotal(e.target.value)}
                  className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:ring-2 focus:ring-indigo-500 focus:outline-none transition-all"
                />
              </div>

              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-2">เฉลยรายข้อ</label>
                <div className="bg-slate-50 p-4 rounded-xl border border-slate-100 max-h-[300px] overflow-y-auto">
                  <div className="grid grid-cols-5 sm:grid-cols-10 gap-2">
                    {answerKeyArray.map((ans, idx) => (
                      <div key={idx} className="flex flex-col items-center">
                        <span className="text-[10px] font-bold text-slate-400 mb-1">{idx + 1}</span>
                        <input 
                          type="text" 
                          value={ans} 
                          onChange={e => handleAnswerChange(idx, e.target.value)}
                          className="w-full text-center py-2 text-sm font-bold bg-white rounded-lg border border-slate-200 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 outline-none transition-all uppercase"
                        />
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-1">รายชื่อนักเรียน (เลขที่, ชื่อ - 1 คนต่อบรรทัด)</label>
                <textarea 
                  rows={6}
                  value={inputStudents} 
                  onChange={e => setInputStudents(e.target.value)}
                  placeholder="1, นายสมชาย&#10;2, นางสาวใจดี"
                  className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:ring-2 focus:ring-indigo-500 focus:outline-none transition-all font-mono text-sm"
                />
              </div>

              <button 
                onClick={startExam}
                className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-4 rounded-xl shadow-lg transition-all"
              >
                เริ่มสแกนข้อสอบ
              </button>
            </div>
          </div>
        )}

        {appState === AppState.SCANNING && (
          <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
            <div className="bg-slate-50 p-4 border-b border-slate-200 flex justify-between items-center">
              <div className="flex items-center gap-3">
                <UserIcon className="w-5 h-5 text-indigo-600" />
                <span className="font-bold">เลขที่ {config.students[currentStudentIndex].id} - {config.students[currentStudentIndex].name}</span>
              </div>
              <span className="text-xs text-slate-500">{currentStudentIndex + 1}/{config.students.length}</span>
            </div>

            <div className="relative aspect-[3/4] bg-black">
              <video ref={videoRef} autoPlay playsInline className="w-full h-full object-cover" />
              <div className="absolute inset-0 border-[40px] border-black/40 pointer-events-none">
                <div className="w-full h-full border-2 border-dashed border-indigo-400 rounded-lg"></div>
              </div>
              {isScanning && (
                <div className="absolute inset-0 bg-black/60 flex flex-col items-center justify-center text-white">
                  <div className="animate-spin rounded-full h-12 w-12 border-4 border-indigo-400 border-t-transparent mb-4"></div>
                  <p className="font-semibold">AI กำลังประมวลผล...</p>
                </div>
              )}
            </div>

            <div className="p-6">
              <button 
                onClick={handleScan}
                disabled={isScanning}
                className="w-full bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white font-bold py-4 rounded-xl flex items-center justify-center gap-2"
              >
                <CameraIcon className="w-6 h-6" /> บันทึกภาพ
              </button>
            </div>
          </div>
        )}

        {appState === AppState.REVIEW && currentScanResult && (
          <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-8 text-center">
             <div className="w-20 h-20 bg-green-100 text-green-600 rounded-full flex items-center justify-center mx-auto mb-6">
               <CheckIcon className="w-10 h-10" />
             </div>
             <h2 className="text-2xl font-bold text-slate-800 mb-2">สแกนสำเร็จ</h2>
             <p className="text-slate-500 mb-8">{config.students[currentStudentIndex].name}</p>

             <div className="bg-slate-50 rounded-2xl p-6 mb-8 inline-block">
               <div className="text-4xl font-black text-indigo-600">
                 {currentScanResult.score} <span className="text-slate-400 text-xl">/ {config.totalQuestions}</span>
               </div>
               <div className="text-xs font-bold text-slate-400 mt-1">คะแนน</div>
             </div>

             <div className="grid grid-cols-2 gap-4 max-w-xs mx-auto">
               <button onClick={() => setAppState(AppState.SCANNING)} className="px-6 py-3 border rounded-xl font-semibold">สแกนใหม่</button>
               <button onClick={confirmResult} className="px-6 py-3 bg-indigo-600 text-white rounded-xl font-semibold">ถัดไป</button>
             </div>
          </div>
        )}

        {appState === AppState.COMPLETED && (
          <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-8 text-center">
            <div className="w-20 h-20 bg-indigo-100 text-indigo-600 rounded-full flex items-center justify-center mx-auto mb-6">
              <DownloadIcon className="w-10 h-10" />
            </div>
            <h2 className="text-2xl font-bold text-slate-800 mb-2">ตรวจเสร็จสิ้น</h2>
            <p className="text-slate-500 mb-8">วิชา: {config.subject}</p>
            <div className="flex flex-col gap-4 max-w-xs mx-auto">
              <button onClick={exportExcel} className="w-full bg-indigo-600 text-white font-bold py-4 rounded-xl flex items-center justify-center gap-2">
                <DownloadIcon className="w-5 h-5" /> ส่งออก Excel
              </button>
              <button onClick={() => window.location.reload()} className="text-slate-500 font-semibold">เริ่มใหม่</button>
            </div>
          </div>
        )}

        <canvas ref={canvasRef} className="hidden" />
      </main>
    </div>
  );
}
