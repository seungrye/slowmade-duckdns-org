package org.slowmade.presence

import android.os.Bundle
import android.view.View
import androidx.fragment.app.Fragment
import androidx.navigation.fragment.findNavController

class LandingFragment : Fragment(R.layout.fragment_landing) {
    override fun onViewCreated(view: View, savedInstanceState: Bundle?) {
        super.onViewCreated(view, savedInstanceState)
        if (TokenStore.getToken(requireContext()) != null) {
            findNavController().navigate(R.id.action_landing_to_main)
        } else {
            findNavController().navigate(R.id.action_landing_to_setup)
        }
    }
}
