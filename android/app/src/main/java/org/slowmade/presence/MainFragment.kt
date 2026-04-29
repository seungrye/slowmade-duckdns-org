package org.slowmade.presence

import android.os.Bundle
import android.view.View
import android.widget.Button
import android.widget.TextView
import androidx.fragment.app.Fragment
import androidx.fragment.app.viewModels
import androidx.navigation.fragment.findNavController

class MainFragment : Fragment(R.layout.fragment_main) {

    private val viewModel: MainViewModel by viewModels()

    override fun onViewCreated(view: View, savedInstanceState: Bundle?) {
        super.onViewCreated(view, savedInstanceState)

        if (TokenStore.getToken(requireContext()) == null) {
            findNavController().navigate(R.id.action_main_to_setup)
            return
        }

        viewModel.load(requireContext())

        viewModel.status.observe(viewLifecycleOwner) { status ->
            view.findViewById<TextView>(R.id.tvStatus).text =
                when (status) {
                    "enter" -> "🏠 재실 중"
                    "exit"  -> "🚶 외출 중"
                    else    -> "상태 확인 중..."
                }
        }

        viewModel.lastEventTime.observe(viewLifecycleOwner) { time ->
            view.findViewById<TextView>(R.id.tvLastEvent).text =
                if (time != null) "마지막 기록: $time" else ""
        }

        view.findViewById<Button>(R.id.btnSettings).setOnClickListener {
            findNavController().navigate(R.id.action_main_to_setup)
        }
    }
}
